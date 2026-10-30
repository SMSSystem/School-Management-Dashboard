import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The SDK wrapper around the large-attachment store, run against an in-memory
// stand-in for the Realtime Database. What it can show: the order of operations,
// that both counters move with the file, retries, and that nothing ever listens
// to /files. What it cannot show: how the real database evaluates the rules.

const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const h = vi.hoisted(() => {
  const state = {
    data: {} as Record<string, unknown>,
    updates: [] as Record<string, unknown>[],
    gets: [] as string[],
    updateBehaviour: [] as Array<'ok' | 'denied' | 'fail' | 'hang'>,
    getHangs: false,
    onValue: undefined as unknown,
    stamp: { '.sv': 'timestamp' },
  };
  return { state };
});

vi.mock('firebase/database', () => {
  h.state.onValue = vi.fn();
  return {
    getDatabase: () => ({}),
    ref: (_db: unknown, path = '') => ({ path }),
    serverTimestamp: () => h.state.stamp,
    get: async (r: { path: string }) => {
      h.state.gets.push(r.path);
      if (h.state.getHangs) return new Promise(() => undefined);
      const v = h.state.data[r.path];
      return { exists: () => v !== undefined, val: () => (v === undefined ? null : v) };
    },
    update: async (_r: unknown, updates: Record<string, unknown>) => {
      h.state.updates.push(updates);
      const next = h.state.updateBehaviour.shift() ?? 'ok';
      if (next === 'denied') {
        throw Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });
      }
      if (next === 'fail') throw new Error('network down');
      if (next === 'hang') return new Promise(() => undefined);
      for (const [path, value] of Object.entries(updates)) {
        if (value === null) delete h.state.data[path];
        else h.state.data[path] = value;
      }
      return undefined;
    },
    onValue: h.state.onValue,
  };
});

vi.mock('../firebase', () => ({ app: {}, databaseUrl: 'https://example-default-rtdb.firebaseio.com' }));

import { BlobStoreError, commitWithBlob, commitWithBlobs, deleteBlob, getBlobDataUrl, largeUploadPolicy, putBlob } from '../blobStore';

const DOC = { dataUrl: 'data:application/pdf;base64,AAAA', mimeType: 'application/pdf' as const, size: 1000 };
const INST = 'inst1';
const INST_COUNTER = 'usage/institutions/inst1/bytes';
const TOTAL_COUNTER = 'usage/total/bytes';
const KEY = '3b1ab39c-1c4e-4f0a-9d3e-0123456789ab';

beforeEach(() => {
  h.state.data = {};
  h.state.updates = [];
  h.state.gets = [];
  h.state.updateBehaviour = [];
  h.state.getHangs = false;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('putBlob', () => {
  it('stores the file and raises both counters in one update, returning a UUID key', async () => {
    h.state.data[INST_COUNTER] = 500;
    h.state.data[TOTAL_COUNTER] = 9000;
    const key = await putBlob(INST, DOC, 'uid1');
    expect(key).toMatch(KEY_RE);
    expect(h.state.updates).toHaveLength(1);
    const u = h.state.updates[0];
    expect(u[INST_COUNTER]).toBe(1500);
    expect(u[TOTAL_COUNTER]).toBe(10000);
    expect(u[`files/${INST}/${key}`]).toEqual({ ...DOC, uploadedAt: h.state.stamp, uploadedBy: 'uid1' });
    expect(h.state.data[`files/${INST}/${key}`]).toBeDefined();
  });

  it('treats missing counters as zero', async () => {
    await putBlob(INST, DOC, 'uid1');
    expect(h.state.updates[0][INST_COUNTER]).toBe(1000);
    expect(h.state.updates[0][TOTAL_COUNTER]).toBe(1000);
  });

  it('refuses before writing anything when the school budget is full', async () => {
    h.state.data[INST_COUNTER] = 200_000_000;
    await expect(putBlob(INST, DOC, 'uid1')).rejects.toThrow('school');
    expect(h.state.updates).toHaveLength(0);
  });

  it('refuses before writing anything when the global budget is full', async () => {
    h.state.data[TOTAL_COUNTER] = 900_000_000;
    const attempt = putBlob(INST, DOC, 'uid1');
    await expect(attempt).rejects.toBeInstanceOf(BlobStoreError);
    await expect(attempt).rejects.toThrow('system');
    expect(h.state.updates).toHaveLength(0);
  });

  it('re-reads the counters and retries with the same key when another upload moved them first', async () => {
    h.state.updateBehaviour = ['denied', 'ok'];
    const key = await putBlob(INST, DOC, 'uid1');
    expect(h.state.updates).toHaveLength(2);
    for (const u of h.state.updates) {
      expect(Object.keys(u).find((k) => k.startsWith('files/'))).toBe(`files/${INST}/${key}`);
    }
    expect(h.state.gets.filter((p) => p === INST_COUNTER)).toHaveLength(2);
  });

  it('gives up after three refused attempts', async () => {
    h.state.updateBehaviour = ['denied', 'denied', 'denied'];
    await expect(putBlob(INST, DOC, 'uid1')).rejects.toBeInstanceOf(BlobStoreError);
    expect(h.state.updates).toHaveLength(3);
  });

  it('does not retry a network failure and says so plainly', async () => {
    h.state.updateBehaviour = ['fail'];
    await expect(putBlob(INST, DOC, 'uid1')).rejects.toThrow('could not be saved');
    expect(h.state.updates).toHaveLength(1);
  });

  it('fails with "could not reach" when reading the counters hangs, as it does offline', async () => {
    vi.useFakeTimers();
    h.state.getHangs = true;
    const attempt = putBlob(INST, DOC, 'uid1');
    const assertion = expect(attempt).rejects.toThrow('Could not reach the file store');
    await vi.advanceTimersByTimeAsync(20_001);
    await assertion;
    expect(h.state.updates).toHaveLength(0);
  });

  it('fails (never silently succeeds) when the upload hangs past the timeout', async () => {
    vi.useFakeTimers();
    h.state.updateBehaviour = ['hang'];
    const attempt = putBlob(INST, DOC, 'uid1');
    const assertion = expect(attempt).rejects.toThrow('taking too long');
    await vi.advanceTimersByTimeAsync(120_001);
    await assertion;
  });
});

describe('getBlobDataUrl', () => {
  it('reads the exact path once and returns the data URL', async () => {
    h.state.data[`files/${INST}/${KEY}`] = { ...DOC };
    await expect(getBlobDataUrl(INST, KEY)).resolves.toBe(DOC.dataUrl);
    expect(h.state.gets).toEqual([`files/${INST}/${KEY}`]);
  });

  it('says the file is gone when it does not exist', async () => {
    await expect(getBlobDataUrl(INST, KEY)).rejects.toThrow('no longer available');
  });

  it('never attaches a listener (it would download every file)', async () => {
    h.state.data[`files/${INST}/${KEY}`] = { ...DOC };
    await getBlobDataUrl(INST, KEY);
    await putBlob(INST, DOC, 'uid1');
    expect(h.state.onValue).not.toHaveBeenCalled();
  });
});

describe('deleteBlob', () => {
  it('removes the file and lowers both counters by its size', async () => {
    h.state.data[`files/${INST}/${KEY}/size`] = 1000;
    h.state.data[INST_COUNTER] = 1500;
    h.state.data[TOTAL_COUNTER] = 10000;
    await expect(deleteBlob(INST, KEY)).resolves.toBe(true);
    const u = h.state.updates[0];
    expect(u[`files/${INST}/${KEY}`]).toBeNull();
    expect(u[INST_COUNTER]).toBe(500);
    expect(u[TOTAL_COUNTER]).toBe(9000);
  });

  it('does nothing and reports false when the file is already gone', async () => {
    await expect(deleteBlob(INST, KEY)).resolves.toBe(false);
    expect(h.state.updates).toHaveLength(0);
  });

  it('never throws, even when the database fails', async () => {
    h.state.data[`files/${INST}/${KEY}/size`] = 1000;
    h.state.updateBehaviour = ['fail'];
    await expect(deleteBlob(INST, KEY)).resolves.toBe(false);
  });

  it('retries once a counter has moved', async () => {
    h.state.data[`files/${INST}/${KEY}/size`] = 1000;
    h.state.updateBehaviour = ['denied', 'ok'];
    await expect(deleteBlob(INST, KEY)).resolves.toBe(true);
    expect(h.state.updates).toHaveLength(2);
  });
});

describe('largeUploadPolicy', () => {
  it('is enabled for teacher and admin roles when a database URL is configured', () => {
    expect(largeUploadPolicy('regular_teacher')).toBe('enabled');
    expect(largeUploadPolicy('student')).toBe('none');
    expect(largeUploadPolicy(undefined)).toBe('none');
  });
});

describe('without a database URL', () => {
  it('reports unconfigured to teacher roles and fails closed on every operation', async () => {
    vi.resetModules();
    vi.doMock('../firebase', () => ({ app: {}, databaseUrl: undefined }));
    const mod = await import('../blobStore');
    expect(mod.largeUploadPolicy('senior_teacher')).toBe('unconfigured');
    expect(mod.largeUploadPolicy('student')).toBe('none');
    await expect(mod.putBlob(INST, DOC, 'uid1')).rejects.toThrow('not set up');
    await expect(mod.getBlobDataUrl(INST, KEY)).rejects.toThrow('not set up');
    await expect(mod.deleteBlob(INST, KEY)).resolves.toBe(false);
    vi.doUnmock('../firebase');
  });
});

describe('commitWithBlob', () => {
  const BIG = { ...DOC, size: 600 * 1024 };

  it('uploads a large file first, then commits with its key', async () => {
    const order: string[] = [];
    const commit = vi.fn(async (key: string | null) => {
      order.push(`commit:${key ? 'key' : 'null'}`);
      expect(h.state.updates).toHaveLength(1); // the upload already happened
    });
    await commitWithBlob(INST, BIG, 'uid1', commit);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0][0]).toMatch(KEY_RE);
    expect(order).toEqual(['commit:key']);
    expect(h.state.data[`files/${INST}/${commit.mock.calls[0][0]}`]).toBeDefined();
  });

  it('never touches the Realtime Database for a small file or no file', async () => {
    const commit = vi.fn(async () => undefined);
    await commitWithBlob(INST, DOC, 'uid1', commit); // 1000 bytes, embedded
    await commitWithBlob(INST, null, 'uid1', commit);
    expect(commit).toHaveBeenNthCalledWith(1, null);
    expect(commit).toHaveBeenNthCalledWith(2, null);
    expect(h.state.updates).toHaveLength(0);
    expect(h.state.gets).toHaveLength(0);
  });

  it('takes the uploaded file back out when the save fails, and rethrows', async () => {
    h.state.data[INST_COUNTER] = 0;
    h.state.data[TOTAL_COUNTER] = 0;
    let uploadedKey = '';
    const commit = vi.fn(async (key: string | null) => {
      uploadedKey = key as string;
      // the upload really landed; deleteBlob reads the stored size to lower the counters
      h.state.data[`files/${INST}/${key}/size`] = BIG.size;
      throw new Error('firestore down');
    });
    await expect(commitWithBlob(INST, BIG, 'uid1', commit)).rejects.toThrow('firestore down');
    const removal = h.state.updates[h.state.updates.length - 1];
    expect(removal[`files/${INST}/${uploadedKey}`]).toBeNull();
  });

  it('does not run the save when the upload itself fails', async () => {
    h.state.updateBehaviour = ['fail'];
    const commit = vi.fn(async () => undefined);
    await expect(commitWithBlob(INST, BIG, 'uid1', commit)).rejects.toBeInstanceOf(BlobStoreError);
    expect(commit).not.toHaveBeenCalled();
  });

  it('reports the uploading state on and off, even when the upload fails', async () => {
    const calls: boolean[] = [];
    await commitWithBlob(INST, BIG, 'uid1', async () => undefined, (u) => calls.push(u));
    expect(calls).toEqual([true, false]);

    h.state.updateBehaviour = ['fail'];
    const failed: boolean[] = [];
    await expect(commitWithBlob(INST, BIG, 'uid1', async () => undefined, (u) => failed.push(u))).rejects.toThrow();
    expect(failed).toEqual([true, false]);

    const small: boolean[] = [];
    await commitWithBlob(INST, DOC, 'uid1', async () => undefined, (u) => small.push(u));
    expect(small).toEqual([]);
  });
});

describe('commitWithBlobs', () => {
  const BIG = { ...DOC, size: 600 * 1024 };

  it('uploads each large file first, then commits with one key per file in order (null for a small one)', async () => {
    const commit = vi.fn(async (keys: (string | null)[]) => {
      expect(h.state.updates).toHaveLength(2); // both uploads already happened
      expect(keys).toHaveLength(3);
    });
    await commitWithBlobs(INST, [BIG, DOC, BIG], 'uid1', commit);
    const keys = commit.mock.calls[0][0];
    expect(keys[0]).toMatch(KEY_RE);
    expect(keys[1]).toBeNull();
    expect(keys[2]).toMatch(KEY_RE);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it('never touches the Realtime Database for small files or none', async () => {
    const commit = vi.fn(async () => undefined);
    await commitWithBlobs(INST, [DOC, DOC], 'uid1', commit);
    await commitWithBlobs(INST, [], 'uid1', commit);
    expect(commit).toHaveBeenNthCalledWith(1, [null, null]);
    expect(commit).toHaveBeenNthCalledWith(2, []);
    expect(h.state.updates).toHaveLength(0);
  });

  it('takes EVERY uploaded file back out when the save fails, and rethrows', async () => {
    let keys: (string | null)[] = [];
    const commit = vi.fn(async (k: (string | null)[]) => {
      keys = k;
      for (const key of k) if (key) h.state.data[`files/${INST}/${key}/size`] = BIG.size;
      throw new Error('firestore down');
    });
    await expect(commitWithBlobs(INST, [BIG, BIG], 'uid1', commit)).rejects.toThrow('firestore down');
    const removed = h.state.updates.filter((u) => Object.values(u).includes(null));
    expect(removed).toHaveLength(2);
    for (const key of keys) {
      expect(removed.some((u) => u[`files/${INST}/${key}`] === null)).toBe(true);
    }
  });

  it('removes the first file when the second upload fails, and never runs the save', async () => {
    h.state.updateBehaviour = ['ok', 'fail'];
    const commit = vi.fn(async () => undefined);
    let firstKey = '';
    const realUpdate = h.state.updates;
    await expect(
      commitWithBlobs(INST, [BIG, BIG], 'uid1', commit, () => {
        const put = Object.keys(realUpdate[0] ?? {}).find((k) => k.startsWith(`files/${INST}/`));
        if (put) {
          firstKey = put.split('/')[2];
          h.state.data[`files/${INST}/${firstKey}/size`] = BIG.size;
        }
      }),
    ).rejects.toBeInstanceOf(BlobStoreError);
    expect(commit).not.toHaveBeenCalled();
    expect(firstKey).toMatch(KEY_RE);
    expect(h.state.updates.some((u) => u[`files/${INST}/${firstKey}`] === null)).toBe(true);
  });

  it('reports the uploading state on and off around each large file only', async () => {
    const calls: boolean[] = [];
    await commitWithBlobs(INST, [BIG, DOC, BIG], 'uid1', async () => undefined, (u) => calls.push(u));
    expect(calls).toEqual([true, false, true, false]);
  });
});
