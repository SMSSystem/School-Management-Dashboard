// Working copies kept on the device so a signed-in tab keeps working without the internet: the profile, the
// institution and attendance drafts (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md). Every record is encrypted
// with the person's session key (offlineCrypto.ts), its id on disk is a one-way tag, and the whole store is deleted at
// sign-out (sessionPurge.ts). Without a key nothing is kept: callers fall back to what they did before.

import { idbDone as done, openIndexedDb } from "@/lib/indexedDb";
import { seal, tagOf, unseal, type Sealed } from "./offlineCrypto";

type StoredRecord = { id: string; owner: string; sealed: Sealed };

export type OfflineBackend = {
  get(id: string): Promise<StoredRecord | undefined>;
  all(): Promise<StoredRecord[]>;
  put(record: StoredRecord): Promise<void>;
  delete(id: string): Promise<void>;
};

export function memoryOfflineBackend(): OfflineBackend {
  const records = new Map<string, StoredRecord>();
  return {
    get: async (id) => records.get(id),
    all: async () => [...records.values()],
    put: async (record) => void records.set(record.id, record),
    delete: async (id) => void records.delete(id),
  };
}

const DB_NAME = "sms_offline";
const RECORDS = "records";

function indexedDbBackend(database: IDBDatabase): OfflineBackend {
  const store = (mode: IDBTransactionMode = "readonly") =>
    database
      .transaction(RECORDS, mode, { durability: "strict" })
      .objectStore(RECORDS);
  return {
    get: (id) => done(store().get(id)) as Promise<StoredRecord | undefined>,
    all: () => done(store().getAll()) as Promise<StoredRecord[]>,
    put: async (record) => void (await done(store("readwrite").put(record))),
    delete: async (id) => void (await done(store("readwrite").delete(id))),
  };
}

let openDb: IDBDatabase | null = null;
let backendPromise: Promise<OfflineBackend> | null = null;

/** IndexedDB where it works; in private modes and with blocked storage, memory, which lasts until a reload. */
function backend(): Promise<OfflineBackend> {
  backendPromise ??= (async () => {
    try {
      if (typeof indexedDB === "undefined") return memoryOfflineBackend();
      openDb = await openIndexedDb(DB_NAME, [RECORDS], "id");
      return indexedDbBackend(openDb);
    } catch {
      return memoryOfflineBackend();
    }
  })();
  return backendPromise;
}

/** Test seam: use this backend from now on, or null to go back to choosing one. */
export function setOfflineBackendForTests(next: OfflineBackend | null): void {
  backendPromise = next ? Promise.resolve(next) : null;
}

type Session = { uid: string; key: CryptoKey; owner: string };
let session: Session | null = null;

/** The signed-in person's key and owner tag, for the outbox (outboxStore.ts), which keeps its own database. */
export function offlineSession(): Readonly<Session> | null {
  return session;
}

/** Whether records can be kept: a person is signed in and their key is available. */
export function offlineStoreReady(): boolean {
  return session !== null;
}

/**
 * Starts (or, with a null key, stops) keeping records for this person, and removes any left by someone else: the
 * reload after a sign-out can interrupt the wipe.
 */
export async function setOfflineSession(
  uid: string | null,
  key: CryptoKey | null,
): Promise<void> {
  if (!uid || !key) {
    session = null;
    return;
  }
  const owner = await tagOf(`owner:${uid}`);
  session = { uid, key, owner };
  try {
    const store = await backend();
    for (const record of await store.all()) {
      if (record.owner !== owner) await store.delete(record.id);
    }
  } catch {
    // Reads check the owner anyway.
  }
}

const recordId = async (s: Session, name: string) => tagOf(`${s.uid}:${name}`);

/** Keeps a working copy. Returns whether it was kept. Never throws. */
export async function saveCopy(name: string, value: unknown): Promise<boolean> {
  const s = session;
  if (!s) return false;
  try {
    const id = await recordId(s, name);
    const sealed = await seal(s.key, id, { name, value });
    await (await backend()).put({ id, owner: s.owner, sealed });
    return true;
  } catch {
    return false;
  }
}

/** A working copy, or undefined. Never throws. */
export async function readCopy<T>(name: string): Promise<T | undefined> {
  const s = session;
  if (!s) return undefined;
  try {
    const id = await recordId(s, name);
    const record = await (await backend()).get(id);
    if (!record || record.owner !== s.owner) return undefined;
    return (await unseal<{ name: string; value: T }>(s.key, id, record.sealed))
      ?.value;
  } catch {
    return undefined;
  }
}

/** Every working copy whose name starts with `prefix`. Never throws. */
export async function readCopies<T>(
  prefix: string,
): Promise<{ name: string; value: T }[]> {
  const s = session;
  if (!s) return [];
  try {
    const out: { name: string; value: T }[] = [];
    for (const record of await (await backend()).all()) {
      if (record.owner !== s.owner) continue;
      const opened = await unseal<{ name: string; value: T }>(
        s.key,
        record.id,
        record.sealed,
      );
      if (opened && opened.name.startsWith(prefix)) out.push(opened);
    }
    return out;
  } catch {
    return [];
  }
}

/** Removes one working copy. Never throws. */
export async function removeCopy(name: string): Promise<void> {
  const s = session;
  if (!s) return;
  try {
    await (await backend()).delete(await recordId(s, name));
  } catch {
    // A copy left behind is still encrypted, and goes at sign-out.
  }
}

/** Deletes every record on this device. Synchronous start, so a reload straight after can't skip it. Never throws. */
export function purgeOfflineStore(): void {
  session = null;
  try {
    openDb?.close();
    openDb = null;
    backendPromise = null;
    if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // setOfflineSession removes another person's records at the next sign-in.
  }
  try {
    localStorage.removeItem(PREFETCH_DONE_KEY);
  } catch {
    // Holds only a user id and a date; the next person's prefetch overwrites it.
  }
}

/** When today's registers were last prefetched on this device (lib/offline/prefetchRegisters.ts): `${uid}:${date}`. */
export const PREFETCH_DONE_KEY = "sms_offline_prefetched";
