// Sends the outbox (outboxStore.ts) to Firestore (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C).
//
// - One sender per person across tabs (a Web Lock); without Web Locks, each tab sends one item at a time and the
//   `lastOpByUser` check below keeps a repeat from writing twice.
// - Each item is one transaction: it reads the register, and if `lastOpByUser.{uid}` already holds this item's id the
//   save landed on an earlier try whose answer was lost, so nothing is written. Otherwise each student is applied,
//   skipped (already as wanted) or set aside as a clash (registerCommands.ts), and the register, `lastOpByUser` and an
//   audit entry are written together. Clashing students wait for the person's choice (state "conflict").
// - A try that takes longer than SEND_TIMEOUT_MS is "unknown" and retried; errors are sorted by outboxPolicy.ts.
// - After a round, each class whose general register was sent gets one summary rebuild.

import {
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { buildAuditEntry } from "@/lib/auditEntry";
import { rebuildSummariesForClass } from "@/lib/attendanceSummaryUtils";
import type { AuditEventType, NonSchoolDayDocument } from "@/lib/firebase";
import { classify, type Clash, type Mark } from "./registerCommands";
import {
  outboxItems,
  putItem,
  removeItem,
  type OutboxItem,
} from "./outboxStore";
import { offlineSession, onOfflineSession } from "./offlineStore";
import {
  SEND_TIMEOUT_MS,
  classifySendError,
  dueItems,
  nextWake,
  quotaResetsAt,
  retryDelay,
} from "./outboxPolicy";

type Outcome = { wrote: boolean; clash: Record<string, Clash> };

const COLLECTIONS = {
  "register.general": "generalAttendance",
  "register.subject": "subjectAttendance",
} as const;

const recordsPatch = (apply: Record<string, Mark>) =>
  Object.fromEntries(
    Object.entries(apply).map(([studentId, mark]) => [
      studentId,
      mark ?? deleteField(),
    ]),
  );

/** One item, in one transaction. Exported for tests. */
export async function sendItem(item: OutboxItem): Promise<Outcome> {
  const p = item.payload;
  const uid = p.actor.uid;
  const ref = institutionDoc(p.institutionId, COLLECTIONS[p.kind], p.docId);
  return runTransaction(
    db,
    async (tx) => {
      const snap = await tx.get(ref);
      const data: DocumentData | undefined = snap.exists()
        ? snap.data()
        : undefined;
      if (data?.lastOpByUser?.[uid] === item.opId)
        return { wrote: false, clash: {} };
      const { apply, clash } = classify(p.command, data?.records);
      if (Object.keys(apply).length === 0) return { wrote: false, clash };
      tx.set(
        ref,
        {
          ...p.fields,
          ...(p.kind === "register.subject" ? { teacherId: uid } : {}),
          institutionId: p.institutionId,
          records: recordsPatch(apply),
          submittedBy: uid,
          submittedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
          markedAt: p.markedAt,
          lastOpByUser: { [uid]: item.opId },
        },
        { merge: true },
      );
      tx.set(
        doc(institutionCollection(p.institutionId, "audit_log")),
        buildAuditEntry({
          institutionId: p.institutionId,
          eventType: p.audit.eventType as AuditEventType,
          detail: p.audit.detail,
          targetUid: p.audit.targetUid,
          targetName: p.audit.targetName,
          performedBy: uid,
          performedByName: p.actor.name,
        }),
      );
      return { wrote: true, clash };
    },
    { maxAttempts: 2 },
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          Object.assign(new Error("Send timed out"), {
            code: "deadline-exceeded",
          }),
        ),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ── Telling the pages ──

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function announce(): void {
  for (const listener of listeners) listener();
  try {
    channel?.postMessage("changed");
  } catch {
    // Other tabs catch up on their own next round.
  }
}

/** Calls `listener` whenever this person's outbox changes, in this tab or another. */
export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Rounds ──

let holdUntil = 0;
/** Set by startOutboxSender, which runs only where the institution's switch is on: before it, a wake sends nothing. */
let sendingOn = false;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function settle(
  item: OutboxItem,
  err: unknown,
  now: number,
): Promise<void> {
  const verdict = classifySendError(err, item.attempts);
  if (verdict.action === "refuse") {
    await putItem({
      ...item,
      state: "refused",
      payload: { ...item.payload, refusedReason: verdict.reason },
    });
    return;
  }
  if (verdict.action === "hold-until-quota-resets")
    holdUntil = quotaResetsAt(now);
  await putItem({
    ...item,
    state: "pending",
    nextAttemptAt: Math.max(now + retryDelay(item.attempts), holdUntil),
  });
}

/** Sends one item and records what happened. Returns whether it wrote a general register. */
async function attempt(item: OutboxItem): Promise<boolean> {
  const tried: OutboxItem = {
    ...item,
    state: "sending",
    attempts: item.attempts + 1,
  };
  await putItem(tried);
  announce();
  try {
    const { wrote, clash } = await withTimeout(
      sendItem(tried),
      SEND_TIMEOUT_MS,
    );
    if (Object.keys(clash).length > 0) {
      const rest = Object.fromEntries(
        Object.entries(tried.payload.command.changes).filter(
          ([id]) => id in clash,
        ),
      );
      await putItem({
        ...tried,
        state: "conflict",
        payload: {
          ...tried.payload,
          clash,
          command: { changes: rest, base: tried.payload.command.base },
        },
      });
    } else {
      await removeItem(tried.opId);
    }
    return wrote && tried.payload.kind === "register.general";
  } catch (err) {
    await settle(tried, err, Date.now());
    return false;
  }
}

async function rebuildSummaries(sent: OutboxItem[]): Promise<void> {
  const done = new Set<string>();
  for (const { payload } of sent) {
    const s = payload.summary;
    if (!s || done.has(`${s.classId}|${s.termId}`)) continue;
    done.add(`${s.classId}|${s.termId}`);
    try {
      await rebuildSummariesForClass({
        ...s,
        institutionId: payload.institutionId,
        nonSchoolDays: s.nonSchoolDays as NonSchoolDayDocument[],
      });
    } catch (err) {
      console.error("Attendance summary rebuild after sending failed:", err);
    }
  }
}

async function sendDue(): Promise<void> {
  const now = Date.now();
  if (now < holdUntil) return;
  const items = await outboxItems();
  const sent: OutboxItem[] = [];
  for (const item of dueItems(items, now)) {
    if (offlineSession()?.uid !== item.payload.actor.uid) continue;
    if (await attempt(item)) sent.push(item);
  }
  await rebuildSummaries(sent);
}

function schedule(at: number | null): void {
  if (timer) clearTimeout(timer);
  timer =
    at === null
      ? null
      : setTimeout(() => void wakeOutbox(), Math.max(0, at - Date.now()));
}

async function withSenderLock(work: () => Promise<void>): Promise<void> {
  const owner = offlineSession()?.owner;
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!owner) return;
  if (!locks) return work();
  await locks.request(
    `sms-outbox-${owner}`,
    { ifAvailable: true },
    async (lock) => {
      // Another tab holds the lock and is sending this person's outbox.
      if (lock) await work();
    },
  );
}

/**
 * Runs a sending round now (or right after the one in progress). Before startOutboxSender (the switch is off), it only
 * tells the pages the outbox changed: a discarded item must not send the rest. Never throws.
 */
export async function wakeOutbox(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    // Offline per the browser: a try would only hang. A failed try is the real signal, so this is just a hint.
    const online =
      typeof navigator === "undefined" || navigator.onLine !== false;
    if (sendingOn && online) await withSenderLock(sendDue);
  } catch (err) {
    console.error("Outbox round failed:", err);
  } finally {
    running = false;
    announce();
    if (again) {
      again = false;
      void wakeOutbox();
    } else if (sendingOn) {
      schedule(nextWake(await outboxItems().catch(() => []), Date.now()));
    }
  }
}

let started = false;

/** Starts sending this tab's person's outbox: now, when the connection or the tab comes back, and when items are due. */
export function startOutboxSender(): void {
  sendingOn = true;
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    channel = new BroadcastChannel("sms-outbox");
    channel.onmessage = () => {
      for (const listener of listeners) listener();
    };
  } catch {
    channel = null;
  }
  window.addEventListener("online", () => void wakeOutbox());
  window.addEventListener("focus", () => void wakeOutbox());
  // On a fresh sign-in the person's key arrives after this starts; send what they left unsent then.
  onOfflineSession(() => void wakeOutbox());
  void wakeOutbox();
}
