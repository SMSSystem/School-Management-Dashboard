// Working copies of what the register pages read (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice B).
// A read that reaches the server saves an encrypted copy; a read that can't (an offline error, or the Firestore SDK
// answering from its empty memory cache) is answered from that copy. Without a session key (students, parents,
// spectators, or before the key is ready) nothing is saved and every read behaves as before. No Firebase import, so
// node tests can import it.

import { offlineStoreReady, readCopy, saveCopy } from "./offlineStore";
import { isOfflineError } from "./offlineStart";

/** What a read got: the value, and whether the SDK answered from its cache instead of the server. */
export type FreshRead<T> = { value: T; fromCache: boolean };

/** What a page shows: the value, and when its copy was saved if it came from one. */
export type CopyRead<T> = {
  value: T;
  fromCopy: boolean;
  savedAt: number | null;
};

type Stored<T> = { value: T; savedAt: number };

const NAME_PREFIX = "wc:";

const online = () =>
  typeof navigator === "undefined" ? true : navigator.onLine !== false;

/** The older of two copy times, for a page showing several copies at once; null when neither is a copy. */
export function olderCopy(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  return b === null ? a : Math.min(a, b);
}

/** Saves a copy in the background. Never throws, and does nothing without a session key. */
export function keepCopy(name: string, value: unknown): void {
  if (!offlineStoreReady()) return;
  const stored: Stored<unknown> = { value, savedAt: Date.now() };
  void saveCopy(NAME_PREFIX + name, stored);
}

/** The saved copy, if there is one. Never throws. */
export async function storedCopy<T>(
  name: string,
): Promise<Stored<T> | undefined> {
  if (!offlineStoreReady()) return undefined;
  const stored = await readCopy<Stored<T>>(NAME_PREFIX + name);
  return stored && typeof stored.savedAt === "number" ? stored : undefined;
}

/**
 * Runs a read, keeping a copy of a server answer. When the device can't reach the server, answers from the copy;
 * with no copy, behaves exactly as the read did on its own (the cache's answer, or the error).
 */
export async function readThrough<T>(
  name: string,
  read: () => Promise<FreshRead<T>>,
): Promise<CopyRead<T>> {
  let fresh: FreshRead<T>;
  try {
    fresh = await read();
  } catch (err) {
    if (!isOfflineError(err, online())) throw err;
    const copy = await storedCopy<T>(name);
    if (!copy) throw err;
    return { value: copy.value, fromCopy: true, savedAt: copy.savedAt };
  }
  if (!fresh.fromCache) {
    keepCopy(name, fresh.value);
    return { value: fresh.value, fromCopy: false, savedAt: null };
  }
  const copy = await storedCopy<T>(name);
  return copy
    ? { value: copy.value, fromCopy: true, savedAt: copy.savedAt }
    : { value: fresh.value, fromCopy: false, savedAt: null };
}

/**
 * The copy with the SDK's own cached view laid over it, register by register and student by student. Offline, the
 * cache holds only what this tab saved since it lost the connection (often a part of one register), so the copy
 * fills in the rest.
 */
export function overlay<
  T extends { id: string; records?: Record<string, unknown> },
>(copy: T[], cached: T[]): T[] {
  const byId = new Map(copy.map((r) => [r.id, r]));
  for (const r of cached) {
    const base = byId.get(r.id);
    byId.set(
      r.id,
      base ? { ...base, ...r, records: { ...base.records, ...r.records } } : r,
    );
  }
  return [...byId.values()];
}
