// Copies of lesson-note files on this device, and a record of what this person has downloaded
// (LESSON_NOTE_12_FILES_SPEC.md section 8). A repeat, a resume or a retry then costs no Firebase read.
// It is only a shortcut: the browser may evict it at any time, and losing it just means fetching again.
// It cannot reduce Firebase storage, because a copy here serves one device. Everything here is wiped at sign-out.
//
// Never throws: a file that cannot be kept is simply fetched again next time.

export const LOCAL_STORE_MAX_BYTES = 50 * 1024 * 1024;

const DB_NAME = 'sms_note_files';
const FILES = 'files';
const LEDGER = 'ledger';
const META = 'meta';

export type StoredFile = { key: string; blob: Blob; fileName: string; size: number; lastUsedAt: number };
export type NoteLedger = { key: string; clickedAt?: number; downloaded: Record<string, true> };
export type NoteFileRef = { id: string; fileName: string; size: number };

export type StoreBackend = {
  getFile(key: string): Promise<StoredFile | undefined>;
  allFiles(): Promise<StoredFile[]>;
  putFile(file: StoredFile): Promise<void>;
  deleteFile(key: string): Promise<void>;
  getLedger(key: string): Promise<NoteLedger | undefined>;
  putLedger(ledger: NoteLedger): Promise<void>;
  getOwner(): Promise<string | undefined>;
  setOwner(uid: string): Promise<void>;
  clear(): Promise<void>;
};

export function memoryBackend(): StoreBackend {
  const files = new Map<string, StoredFile>();
  const ledgers = new Map<string, NoteLedger>();
  let owner: string | undefined;
  return {
    getFile: async (key) => files.get(key),
    allFiles: async () => [...files.values()],
    putFile: async (file) => void files.set(file.key, file),
    deleteFile: async (key) => void files.delete(key),
    getLedger: async (key) => ledgers.get(key),
    putLedger: async (ledger) => void ledgers.set(ledger.key, ledger),
    getOwner: async () => owner,
    setOwner: async (uid) => void (owner = uid),
    clear: async () => {
      files.clear();
      ledgers.clear();
      owner = undefined;
    },
  };
}

const done = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

function indexedDbBackend(database: IDBDatabase): StoreBackend {
  const store = (name: string, mode: IDBTransactionMode = 'readonly') => database.transaction(name, mode).objectStore(name);
  return {
    getFile: (key) => done(store(FILES).get(key)),
    allFiles: () => done(store(FILES).getAll()),
    putFile: async (file) => void (await done(store(FILES, 'readwrite').put(file))),
    deleteFile: async (key) => void (await done(store(FILES, 'readwrite').delete(key))),
    getLedger: (key) => done(store(LEDGER).get(key)),
    putLedger: async (ledger) => void (await done(store(LEDGER, 'readwrite').put(ledger))),
    getOwner: async () => ((await done(store(META).get('owner'))) as { uid?: string } | undefined)?.uid,
    setOwner: async (uid) => void (await done(store(META, 'readwrite').put({ key: 'owner', uid }))),
    clear: async () => {
      await Promise.all([FILES, LEDGER, META].map((name) => done(store(name, 'readwrite').clear())));
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const name of [FILES, LEDGER, META]) request.result.createObjectStore(name, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('blocked'));
  });
}

let openDb: IDBDatabase | null = null;
let backendPromise: Promise<StoreBackend> | null = null;

/** IndexedDB where it works; in private modes and with blocked storage, memory, which lasts until a refresh. */
function backend(): Promise<StoreBackend> {
  backendPromise ??= (async () => {
    try {
      if (typeof indexedDB === 'undefined') return memoryBackend();
      openDb = await openDatabase();
      return indexedDbBackend(openDb);
    } catch {
      return memoryBackend();
    }
  })();
  return backendPromise;
}

/** Test seam: use this backend from now on, or null to go back to choosing one. */
export function setStoreBackendForTests(next: StoreBackend | null): void {
  backendPromise = next ? Promise.resolve(next) : null;
}

const fileKey = (uid: string, noteId: string, fileId: string) => `${uid}/${noteId}/${fileId}`;
const ledgerKey = (uid: string, noteId: string) => `${uid}/${noteId}`;

/** This device's copy of a file, or null. The name and size must match too, which covers the older `data` id. */
export async function getStoredFile(uid: string, noteId: string, file: NoteFileRef): Promise<Blob | null> {
  try {
    const store = await backend();
    const found = await store.getFile(fileKey(uid, noteId, file.id));
    if (!found || found.fileName !== file.fileName || found.size !== file.size) return null;
    await store.putFile({ ...found, lastUsedAt: Date.now() });
    return found.blob;
  } catch {
    return null;
  }
}

/** Whether every one of these files has a copy on this device. */
export async function hasStoredFiles(uid: string, noteId: string, files: readonly NoteFileRef[]): Promise<boolean> {
  try {
    const store = await backend();
    const found = await Promise.all(files.map((f) => store.getFile(fileKey(uid, noteId, f.id))));
    return found.every((copy, i) => copy && copy.fileName === files[i].fileName && copy.size === files[i].size);
  } catch {
    return false;
  }
}

/** Keeps a copy, removing the least recently used files if the store would go over its limit. */
export async function storeFile(uid: string, noteId: string, file: NoteFileRef, blob: Blob): Promise<void> {
  if (blob.size > LOCAL_STORE_MAX_BYTES) return;
  try {
    const store = await backend();
    const key = fileKey(uid, noteId, file.id);
    const others = (await store.allFiles()).filter((f) => f.key !== key).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    let used = others.reduce((sum, f) => sum + f.blob.size, 0) + blob.size;
    for (const oldest of others) {
      if (used <= LOCAL_STORE_MAX_BYTES) break;
      await store.deleteFile(oldest.key);
      used -= oldest.blob.size;
    }
    await store.putFile({ key, blob, fileName: file.fileName, size: file.size, lastUsedAt: Date.now() });
  } catch {
    // Quota or a closed database: this file is fetched again next time.
  }
}

/** What this person has downloaded from a note on this device. */
export async function readLedger(uid: string, noteId: string): Promise<NoteLedger> {
  const key = ledgerKey(uid, noteId);
  try {
    return (await (await backend()).getLedger(key)) ?? { key, downloaded: {} };
  } catch {
    return { key, downloaded: {} };
  }
}

export async function markClicked(uid: string, noteId: string): Promise<void> {
  try {
    await (await backend()).putLedger({ ...(await readLedger(uid, noteId)), clickedAt: Date.now() });
  } catch {
    // Without a record the button simply stays as it was; the monthly counter still applies.
  }
}

export async function markDownloaded(uid: string, noteId: string, fileIds: readonly string[]): Promise<void> {
  if (fileIds.length === 0) return;
  try {
    const ledger = await readLedger(uid, noteId);
    const downloaded = { ...ledger.downloaded };
    for (const id of fileIds) downloaded[id] = true;
    await (await backend()).putLedger({ ...ledger, downloaded });
  } catch {
    // See markClicked.
  }
}

/** Clears the store if it holds someone else's files: the reload after a sign-out can interrupt the wipe. */
export async function setNoteFileOwner(uid: string): Promise<void> {
  try {
    const store = await backend();
    const owner = await store.getOwner();
    if (owner === uid) return;
    if (owner !== undefined) await store.clear();
    await store.setOwner(uid);
  } catch {
    // Nothing to do: reads check the uid in their keys anyway.
  }
}

/** Removes every copy and record on this device. Never throws. */
export function purgeNoteFileStore(): void {
  try {
    openDb?.close();
    openDb = null;
    backendPromise = null;
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(DB_NAME);
  } catch {
    // setNoteFileOwner clears it at the next sign-in.
  }
}
