// The outbox: register saves waiting to reach the server (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md,
// slice C). Each item is encrypted with the person's session key (offlineCrypto.ts) and kept in its own database,
// `sms_outbox`, which sign-out does not delete: unsent work stays until the same person signs in again and it is sent,
// or until it expires (slice C2). Only the fields the sender needs to order and retry items are readable on disk;
// the owner and the register are one-way tags.

import { idbDone as done, openIndexedDb } from "@/lib/indexedDb";
import { seal, tagOf, unseal, type Sealed } from "./offlineCrypto";
import { offlineSession } from "./offlineStore";
import { isExpired } from "./outboxPolicy";
import {
  mergeCommands,
  type Clash,
  type RegisterCommand,
} from "./registerCommands";

export type OutboxState = "pending" | "sending" | "conflict" | "refused";

/** Everything the sender needs to send a register save, and to rebuild the class summary after it. */
export type OutboxPayload = {
  schema: 1;
  kind: "register.general" | "register.subject";
  institutionId: string;
  /** `ga_…` / `sa_…`, or the id of a register saved before ids came from the register. */
  docId: string;
  /** Plain text only inside the seal: the register this item writes to, for coalescing and the page's status. */
  targetKey: string;
  /** The register's own fields, as the save writes them (class, date, session or subject, term, year, names). */
  fields: Record<string, string>;
  command: RegisterCommand;
  /** Students someone else changed meanwhile, filled in by the sender (state "conflict"). */
  clash?: Record<string, Clash>;
  /** Why the server refused it (state "refused"), in plain words. */
  refusedReason?: string;
  markedAt: number;
  actor: { uid: string; name: string };
  audit: {
    eventType: string;
    detail: string;
    targetUid: string;
    targetName: string;
  };
  /** For a general register: what the class summary rebuild needs, so it can run after the page is left. */
  summary?: {
    classId: string;
    termId: string;
    academicYearId: string;
    termStartDate: string;
    termEndDate: string;
    schoolWeekDays: number[];
    nonSchoolDays: unknown[];
  };
};

export type OutboxItem = {
  opId: string;
  state: OutboxState;
  attempts: number;
  createdAt: number;
  expiresAt: number;
  nextAttemptAt: number;
  payload: OutboxPayload;
};

type Row = Omit<OutboxItem, "payload"> & {
  owner: string;
  target: string;
  sealed: Sealed;
};

export type OutboxBackend = {
  all(): Promise<Row[]>;
  put(row: Row): Promise<void>;
  delete(opId: string): Promise<void>;
};

export function memoryOutboxBackend(): OutboxBackend {
  const rows = new Map<string, Row>();
  return {
    all: async () => [...rows.values()],
    put: async (row) => void rows.set(row.opId, row),
    delete: async (opId) => void rows.delete(opId),
  };
}

const DB_NAME = "sms_outbox";
const ITEMS = "items";
/** Unsent work is kept this long; slice C2 warns before anything is removed. */
export const OUTBOX_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

function indexedDbBackend(database: IDBDatabase): OutboxBackend {
  const store = (mode: IDBTransactionMode = "readonly") =>
    database
      .transaction(ITEMS, mode, { durability: "strict" })
      .objectStore(ITEMS);
  return {
    all: () => done(store().getAll()) as Promise<Row[]>,
    put: async (row) => void (await done(store("readwrite").put(row))),
    delete: async (opId) => void (await done(store("readwrite").delete(opId))),
  };
}

let backendPromise: Promise<OutboxBackend> | null = null;

/** IndexedDB where it works; in private modes and with blocked storage, memory, which lasts until a reload. */
function backend(): Promise<OutboxBackend> {
  backendPromise ??= (async () => {
    try {
      if (typeof indexedDB === "undefined") return memoryOutboxBackend();
      return indexedDbBackend(await openIndexedDb(DB_NAME, [ITEMS], "opId"));
    } catch {
      return memoryOutboxBackend();
    }
  })();
  return backendPromise;
}

/** Test seam: use this backend from now on, or null to go back to choosing one. */
export function setOutboxBackendForTests(next: OutboxBackend | null): void {
  backendPromise = next ? Promise.resolve(next) : null;
}

const newOpId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function sealRow(item: OutboxItem): Promise<Row | null> {
  const s = offlineSession();
  if (!s) return null;
  const { payload, ...plain } = item;
  return {
    ...plain,
    owner: s.owner,
    target: await tagOf(`${s.uid}:${payload.targetKey}`),
    sealed: await seal(s.key, item.opId, payload),
  };
}

/** This person's items, oldest first. Another person's rows are never opened. */
export async function outboxItems(): Promise<OutboxItem[]> {
  const s = offlineSession();
  if (!s) return [];
  const items: OutboxItem[] = [];
  for (const row of await (await backend()).all()) {
    if (row.owner !== s.owner) continue;
    const payload = await unseal<OutboxPayload>(s.key, row.opId, row.sealed);
    if (!payload) continue;
    items.push({
      opId: row.opId,
      state: row.state,
      attempts: row.attempts,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      nextAttemptAt: row.nextAttemptAt,
      payload,
    });
  }
  return items.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Queues a register save, or folds it into the same register's item if that one hasn't been tried yet (an item that
 * has been tried may already have landed, so it is never changed) and hasn't expired (it would take the new save's
 * marks with it into the expiry dialog). Resolves once the item is on disk, so the page can
 * say it is saved on this device. Null when there is no session key to seal it with.
 */
export async function enqueueSave(
  payload: Omit<OutboxPayload, "schema">,
  now = Date.now(),
  { fold = true }: { fold?: boolean } = {},
): Promise<OutboxItem | null> {
  if (!offlineSession()) return null;
  const waiting = (await outboxItems()).find(
    (item) =>
      fold &&
      item.state === "pending" &&
      item.attempts === 0 &&
      !isExpired(item, now) &&
      item.payload.targetKey === payload.targetKey,
  );
  const item: OutboxItem = waiting
    ? {
        ...waiting,
        nextAttemptAt: now,
        payload: {
          ...waiting.payload,
          ...payload,
          schema: 1,
          command: mergeCommands(waiting.payload.command, payload.command),
        },
      }
    : {
        opId: newOpId(),
        state: "pending",
        attempts: 0,
        createdAt: now,
        expiresAt: now + OUTBOX_KEEP_MS,
        nextAttemptAt: now,
        payload: { ...payload, schema: 1 },
      };
  return (await putItem(item)) ? item : null;
}

/** Writes an item back after the sender or the page changed it. Returns whether it was kept. */
export async function putItem(item: OutboxItem): Promise<boolean> {
  const row = await sealRow(item);
  if (!row) return false;
  await (await backend()).put(row);
  return true;
}

/** Removes an item: sent, or discarded by the person. */
export async function removeItem(opId: string): Promise<void> {
  await (await backend()).delete(opId);
}

/** Rows nobody came back to are removed this long after they expired, whoever they belong to (14 days in all). */
const ABANDONED_AFTER_MS = OUTBOX_KEEP_MS;

/**
 * Removes every row, of any person on this device, that expired more than 7 days ago. Only the plain `expiresAt` is
 * read: another person's seal is never opened. A person's own expired items stay for their choice until then. Never
 * throws.
 */
export async function dropAbandoned(now = Date.now()): Promise<number> {
  try {
    const store = await backend();
    let dropped = 0;
    for (const row of await store.all()) {
      if (now < row.expiresAt + ABANDONED_AFTER_MS) continue;
      await store.delete(row.opId);
      dropped += 1;
    }
    return dropped;
  } catch {
    return 0;
  }
}
