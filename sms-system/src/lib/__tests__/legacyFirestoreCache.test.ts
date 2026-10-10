import { describe, expect, it } from 'vitest';
import {
  LEGACY_CACHE_CLEANED_FLAG,
  legacyDatabaseName,
  removeLegacyFirestoreCache,
} from '../legacyFirestoreCache';
import { createFakeStorage } from './fakeStorage';

type Outcome = 'success' | 'error' | 'blocked';

// A fake IDBFactory: deleteDatabase records the name and fires the event the
// caller registered for the configured outcome, asynchronously like the real one.
function fakeIdb(outcome: Outcome = 'success', listed?: string[]) {
  const deleted: string[] = [];
  const idb = {
    deleteDatabase(name: string) {
      deleted.push(name);
      const req = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (outcome === 'success') req.onsuccess?.(new Event('success'));
        else if (outcome === 'error') req.onerror?.(new Event('error'));
        else req.onblocked?.(new Event('blocked') as unknown as IDBVersionChangeEvent);
      });
      return req;
    },
    databases: listed ? async () => listed.map((name) => ({ name, version: 1 })) : undefined,
  };
  return { idb, deleted };
}

describe('removeLegacyFirestoreCache', () => {
  it('names the database the SDK used', () => {
    expect(legacyDatabaseName('school-sms-v1')).toBe('firestore/[DEFAULT]/school-sms-v1/main');
  });

  it('deletes the database and the firestore_* localStorage keys, then sets the flag', async () => {
    const storage = createFakeStorage();
    storage.setItem('firestore_clients_abc', '1');
    storage.setItem('firestore_online_state_abc', '1');
    storage.setItem('sidebar-collapsed', '1');
    const { idb, deleted } = fakeIdb();
    const result = await removeLegacyFirestoreCache({ projectId: 'school-sms-v1', idb, storage });
    expect(result).toBe('done');
    expect(deleted).toEqual(['firestore/[DEFAULT]/school-sms-v1/main']);
    expect(storage.dump()).toEqual({ 'sidebar-collapsed': '1', [LEGACY_CACHE_CLEANED_FLAG]: '1' });
  });

  it('also deletes every other firestore/ database the browser lists', async () => {
    const { idb, deleted } = fakeIdb('success', [
      'firestore/[DEFAULT]/school-sms-v1/main',
      'firestore/[DEFAULT]/old-project/main',
      'firebaseLocalStorageDb',
    ]);
    await removeLegacyFirestoreCache({ projectId: 'school-sms-v1', idb, storage: createFakeStorage() });
    expect([...deleted].sort()).toEqual([
      'firestore/[DEFAULT]/old-project/main',
      'firestore/[DEFAULT]/school-sms-v1/main',
    ]);
  });

  it('does nothing once the flag is set', async () => {
    const storage = createFakeStorage();
    storage.setItem(LEGACY_CACHE_CLEANED_FLAG, '1');
    const { idb, deleted } = fakeIdb();
    expect(await removeLegacyFirestoreCache({ projectId: 'p', idb, storage })).toBe('skipped');
    expect(deleted).toEqual([]);
  });

  it('leaves the flag unset when another tab blocks the delete, so it retries next load', async () => {
    const storage = createFakeStorage();
    const { idb } = fakeIdb('blocked');
    expect(await removeLegacyFirestoreCache({ projectId: 'p', idb, storage })).toBe('blocked');
    expect(storage.getItem(LEGACY_CACHE_CLEANED_FLAG)).toBeNull();
  });

  it('reports unsupported when IndexedDB is unavailable', async () => {
    expect(
      await removeLegacyFirestoreCache({ projectId: 'p', idb: null, storage: createFakeStorage() }),
    ).toBe('unsupported');
  });
});
