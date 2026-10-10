// One-time removal of the Firestore IndexedDB cache this app used to write.
//
// Until the switch to an in-memory cache (lib/firebase.ts), the SDK stored every
// document a signed-in user read in the IndexedDB database
// `firestore/[DEFAULT]/<projectId>/main` and a few `firestore_*` bookkeeping keys
// in localStorage, and never cleared them. The new build never opens that
// database, so without this the old copy would sit in every browser that had
// used the app, readable from DevTools by whoever uses the machine next.
//
// Runs once per browser (flag below). If another tab still runs the old build it
// holds the database open and the delete is "blocked": the flag is NOT set, so the
// next load tries again.

import { removeStorageKeysByPrefix } from './storagePrefixScan';

export const LEGACY_CACHE_CLEANED_FLAG = 'sms_idb_cleaned_v1';
const FIRESTORE_DB_PREFIX = 'firestore/';
const FIRESTORE_LOCAL_STORAGE_PREFIX = 'firestore_';
const DELETE_TIMEOUT_MS = 5000;

export type LegacyCleanupResult = 'skipped' | 'done' | 'blocked' | 'unsupported';

type IdbLike = Pick<IDBFactory, 'deleteDatabase'> & {
  databases?: () => Promise<{ name?: string }[]>;
};

// The name the SDK used: `firestore/<persistenceKey>/<projectId>/main`
// (persistenceKey is the app name, "[DEFAULT]").
export function legacyDatabaseName(projectId: string): string {
  return `${FIRESTORE_DB_PREFIX}[DEFAULT]/${projectId}/main`;
}

function deleteDatabase(idb: IdbLike, name: string): Promise<'deleted' | 'blocked'> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v: 'deleted' | 'blocked') => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    try {
      const req = idb.deleteDatabase(name);
      req.onsuccess = () => finish('deleted');
      req.onerror = () => finish('blocked');
      req.onblocked = () => finish('blocked');
    } catch {
      finish('blocked');
    }
    setTimeout(() => finish('blocked'), DELETE_TIMEOUT_MS);
  });
}

export async function removeLegacyFirestoreCache(opts: {
  projectId: string;
  idb?: IdbLike | null;
  storage?: Storage | null;
}): Promise<LegacyCleanupResult> {
  const storage = opts.storage ?? null;
  try {
    if (storage?.getItem(LEGACY_CACHE_CLEANED_FLAG) === '1') return 'skipped';
  } catch {
    /* storage unavailable: carry on, the delete is idempotent */
  }

  const idb = opts.idb ?? null;
  if (!idb) return 'unsupported';

  // Every `firestore/...` database (covers a named database or another project
  // id); `databases()` is missing in older browsers, so the known name is also
  // always tried.
  const names = new Set<string>([legacyDatabaseName(opts.projectId)]);
  try {
    const listed = typeof idb.databases === 'function' ? await idb.databases() : [];
    for (const d of listed) {
      if (d.name?.startsWith(FIRESTORE_DB_PREFIX)) names.add(d.name);
    }
  } catch {
    /* fall back to the known name */
  }

  const results = await Promise.all([...names].map((n) => deleteDatabase(idb, n)));

  try {
    if (storage) removeStorageKeysByPrefix(storage, FIRESTORE_LOCAL_STORAGE_PREFIX);
  } catch {
    /* non-fatal */
  }

  if (results.includes('blocked')) return 'blocked';
  try {
    storage?.setItem(LEGACY_CACHE_CLEANED_FLAG, '1');
  } catch {
    /* non-fatal: it just runs again next load */
  }
  return 'done';
}

// Browser entry point; called once from main.tsx.
export function cleanupLegacyFirestoreCache(projectId: string): void {
  if (typeof indexedDB === 'undefined' || typeof localStorage === 'undefined') return;
  void removeLegacyFirestoreCache({ projectId, idb: indexedDB, storage: localStorage });
}
