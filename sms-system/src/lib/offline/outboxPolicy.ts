// When and how the outbox sender (outboxSender.ts) tries again (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md,
// slice C). Pure: no Firebase import, so node tests can import it. Nothing here decides the device is offline from the
// clock: a failed or timed-out attempt is the signal, and the next one waits a little longer.

import type { OutboxItem } from "./outboxStore";

/** A send that took longer than this is "unknown", not failed: the retry checks whether it landed. */
export const SEND_TIMEOUT_MS = 12_000;
const FIRST_RETRY_MS = 5_000;
const LONGEST_RETRY_MS = 5 * 60_000;
/** How many refusals that may be passing hiccups (App Check, a lost token) are retried before the item is refused. */
const REFUSAL_RETRIES = 3;

export type SendVerdict =
  | { action: "retry" }
  | { action: "wait-for-sign-in" }
  | { action: "hold-until-quota-resets" }
  | { action: "refuse"; reason: string };

const codeOf = (err: unknown): string => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code.replace(/^firestore\//, "") : "";
};

/** What to do after a failed send, given how many times this item has now been tried. */
export function classifySendError(err: unknown, attempts: number): SendVerdict {
  switch (codeOf(err)) {
    case "unauthenticated":
      return { action: "wait-for-sign-in" };
    case "resource-exhausted":
      return { action: "hold-until-quota-resets" };
    case "permission-denied":
      return attempts >= REFUSAL_RETRIES
        ? {
            action: "refuse",
            reason:
              "The server refused this register. Your role or class may have changed since it was marked.",
          }
        : { action: "retry" };
    case "failed-precondition":
    case "aborted":
      return attempts >= REFUSAL_RETRIES
        ? {
            action: "refuse",
            reason: "The server couldn't apply this register.",
          }
        : { action: "retry" };
    case "invalid-argument":
    case "not-found":
      return {
        action: "refuse",
        reason: "The server couldn't accept this register.",
      };
    default:
      // unavailable, deadline-exceeded, a timeout or a network failure: try again later.
      return { action: "retry" };
  }
}

/** How long to wait before the next try: doubling from 5 s to 5 min, with ±30% jitter so a school reconnecting at once spreads out. */
export function retryDelay(
  attempts: number,
  random: () => number = Math.random,
): number {
  const base = Math.min(
    LONGEST_RETRY_MS,
    FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1),
  );
  return Math.round(base * (0.7 + 0.6 * random()));
}

/** The daily Firestore quota resets at midnight US Pacific; 08:00 UTC is that or an hour after it. */
export function quotaResetsAt(now: number): number {
  const reset = new Date(now);
  reset.setUTCHours(8, 0, 0, 0);
  if (reset.getTime() <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset.getTime();
}

/**
 * Whether an item has passed its 7 days (outboxStore.ts, OUTBOX_KEEP_MS). An expired item is no longer sent on its
 * own: a week-old mark must not quietly overwrite newer work. It waits for the person to send, export or discard it.
 */
export function isExpired(item: OutboxItem, now: number): boolean {
  return now >= item.expiresAt;
}

const waitingToSend = (item: OutboxItem, now: number) =>
  (item.state === "pending" || item.state === "sending") &&
  !isExpired(item, now);

/**
 * The items to send now: per register, its oldest item that is waiting, once its next try is due. A later item for
 * the same register waits behind it, so one person's saves land in the order they were made. An item left "sending"
 * by a tab that closed mid-send counts as waiting; an expired one holds its register until the person settles it.
 */
export function dueItems(items: OutboxItem[], now: number): OutboxItem[] {
  const seen = new Set<string>();
  const due: OutboxItem[] = [];
  for (const item of [...items].sort((a, b) => a.createdAt - b.createdAt)) {
    if (item.state !== "pending" && item.state !== "sending") continue;
    const target = item.payload.targetKey;
    if (seen.has(target)) continue;
    seen.add(target);
    if (!isExpired(item, now) && item.nextAttemptAt <= now) due.push(item);
  }
  return due;
}

/** When the sender should look again: the soonest waiting item's next try, or null when nothing waits. */
export function nextWake(items: OutboxItem[], now: number): number | null {
  const times = items
    .filter((item) => waitingToSend(item, now))
    .map((item) => Math.max(now, item.nextAttemptAt));
  return times.length > 0 ? Math.min(...times) : null;
}

/** How many items are still to be sent on their own: waiting, not expired. A clash, refusal or expiry waits for the person. */
export function waitingCount(items: OutboxItem[], now: number): number {
  return items.filter((item) => waitingToSend(item, now)).length;
}

/** How many registers the items belong to: a register saved twice before sending has two items (slice C2). */
export function registerCount(items: OutboxItem[]): number {
  return new Set(items.map((item) => item.payload.targetKey)).size;
}

/** When the soonest waiting item expires, so a page can look again then; null when none will. */
export function nextExpiry(items: OutboxItem[], now: number): number | null {
  const times = items
    .filter((item) => waitingToSend(item, now))
    .map((item) => item.expiresAt);
  return times.length > 0 ? Math.min(...times) : null;
}

export type WatchedDraft = { draftKey: string; snapshot: string };

/**
 * The page drafts to clear now (useRegisterOutbox): those whose register no longer has any outbox item, so its save
 * was sent. A register still waiting, in conflict or refused keeps its draft. The ones returned are no longer watched.
 */
export function sentDrafts(
  watched: Map<string, WatchedDraft>,
  items: OutboxItem[],
): WatchedDraft[] {
  const keys = new Set(items.map((item) => item.payload.targetKey));
  const sent: WatchedDraft[] = [];
  for (const [targetKey, draft] of watched) {
    if (keys.has(targetKey)) continue;
    watched.delete(targetKey);
    sent.push(draft);
  }
  return sent;
}
