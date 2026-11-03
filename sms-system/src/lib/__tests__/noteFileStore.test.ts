import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOCAL_STORE_MAX_BYTES,
  getStoredFile,
  hasStoredFiles,
  markClicked,
  markDownloaded,
  memoryBackend,
  purgeNoteFileStore,
  readLedger,
  setNoteFileOwner,
  setStoreBackendForTests,
  storeFile,
  type StoreBackend,
} from '../noteFileStore';

// Runs against the in-memory backend, which has the same shape as the IndexedDB one. The real IndexedDB is exercised
// in a browser by e2e/31-lesson-note-download-all.spec.ts; no fake IndexedDB library is installed here.

const ref = (id: string, size = 3, fileName = `${id}.pdf`) => ({ id, fileName, size });
const blob = (size = 3) => new Blob([new Uint8Array(size)]);
let store: StoreBackend;

beforeEach(() => {
  store = memoryBackend();
  setStoreBackendForTests(store);
});
afterEach(() => setStoreBackendForTests(null));

describe('copies of files', () => {
  it('gives back what was kept, and null otherwise', async () => {
    expect(await getStoredFile('u', 'n', ref('a'))).toBeNull();
    await storeFile('u', 'n', ref('a'), blob());
    expect((await getStoredFile('u', 'n', ref('a')))?.size).toBe(3);
  });

  it('keeps them per person and per note', async () => {
    await storeFile('u', 'n', ref('a'), blob());
    expect(await getStoredFile('other', 'n', ref('a'))).toBeNull();
    expect(await getStoredFile('u', 'other', ref('a'))).toBeNull();
  });

  it('ignores a copy whose name or size no longer matches, as the older `data` id could', async () => {
    await storeFile('u', 'n', ref('data', 3, 'old.pdf'), blob());
    expect(await getStoredFile('u', 'n', ref('data', 3, 'new.pdf'))).toBeNull();
    expect(await getStoredFile('u', 'n', ref('data', 4, 'old.pdf'))).toBeNull();
  });

  it('knows whether every file is here', async () => {
    await storeFile('u', 'n', ref('a'), blob());
    expect(await hasStoredFiles('u', 'n', [ref('a')])).toBe(true);
    expect(await hasStoredFiles('u', 'n', [ref('a'), ref('b')])).toBe(false);
  });

  it('removes the least recently used files to stay inside the limit', async () => {
    const mb = 1024 * 1024;
    await storeFile('u', 'n', ref('old', 20 * mb), blob(20 * mb));
    await new Promise((r) => setTimeout(r, 5));
    await storeFile('u', 'n', ref('used', 20 * mb), blob(20 * mb));
    await new Promise((r) => setTimeout(r, 5));
    await getStoredFile('u', 'n', ref('old', 20 * mb)); // now the most recently used
    await new Promise((r) => setTimeout(r, 5));
    await storeFile('u', 'n', ref('new', 20 * mb), blob(20 * mb));
    expect(await getStoredFile('u', 'n', ref('used', 20 * mb))).toBeNull();
    expect(await getStoredFile('u', 'n', ref('old', 20 * mb))).not.toBeNull();
    expect(await getStoredFile('u', 'n', ref('new', 20 * mb))).not.toBeNull();
  });

  it('does not keep a file bigger than the whole store', async () => {
    const size = LOCAL_STORE_MAX_BYTES + 1;
    await storeFile('u', 'n', ref('huge', size), blob(size));
    expect(await hasStoredFiles('u', 'n', [ref('huge', size)])).toBe(false);
  });

  it('never throws when storage fails', async () => {
    const broken = Object.fromEntries(
      Object.keys(store).map((k) => [k, () => Promise.reject(new Error('quota'))]),
    ) as unknown as StoreBackend;
    setStoreBackendForTests(broken);
    await expect(storeFile('u', 'n', ref('a'), blob())).resolves.toBeUndefined();
    await expect(getStoredFile('u', 'n', ref('a'))).resolves.toBeNull();
    await expect(hasStoredFiles('u', 'n', [ref('a')])).resolves.toBe(false);
    await expect(markDownloaded('u', 'n', ['a'])).resolves.toBeUndefined();
    await expect(markClicked('u', 'n')).resolves.toBeUndefined();
    await expect(readLedger('u', 'n')).resolves.toEqual({ key: 'u/n', downloaded: {} });
    await expect(setNoteFileOwner('u')).resolves.toBeUndefined();
  });
});

describe('the ledger', () => {
  it('starts empty, and records clicks and downloads without losing either', async () => {
    expect(await readLedger('u', 'n')).toEqual({ key: 'u/n', downloaded: {} });
    await markDownloaded('u', 'n', ['a']);
    await markClicked('u', 'n');
    await markDownloaded('u', 'n', ['b']);
    const ledger = await readLedger('u', 'n');
    expect(ledger.downloaded).toEqual({ a: true, b: true });
    expect(ledger.clickedAt).toEqual(expect.any(Number));
  });

  it('keeps its record when a file copy is evicted', async () => {
    await storeFile('u', 'n', ref('a'), blob());
    await markDownloaded('u', 'n', ['a']);
    await store.deleteFile('u/n/a');
    expect((await readLedger('u', 'n')).downloaded).toEqual({ a: true });
  });
});

describe('between people', () => {
  it('keeps everything for the same person', async () => {
    await setNoteFileOwner('u');
    await storeFile('u', 'n', ref('a'), blob());
    await setNoteFileOwner('u');
    expect(await getStoredFile('u', 'n', ref('a'))).not.toBeNull();
  });

  it('clears everything when someone else signs in, in case the sign-out wipe was interrupted', async () => {
    await setNoteFileOwner('u');
    await storeFile('u', 'n', ref('a'), blob());
    await markDownloaded('u', 'n', ['a']);
    await setNoteFileOwner('someone-else');
    expect((await store.allFiles()).length).toBe(0);
    expect((await readLedger('u', 'n')).downloaded).toEqual({});
  });

  it('purging never throws without IndexedDB', () => {
    expect(() => purgeNoteFileStore()).not.toThrow();
  });
});
