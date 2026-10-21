import { beforeEach, describe, expect, it, vi } from 'vitest';

// The server clock of an attempt (EXAMS_FEATURE_SPEC.md §4.5). Found by the end-to-end run: once the session lock has
// connected, the Realtime Database answers `.info/serverTimeOffset` from its cache, so the callback runs before onValue
// has returned the unsubscribe function, and the start screen waited forever.

const h = vi.hoisted(() => ({
  mode: 'sync' as 'sync' | 'async' | 'never' | 'error',
  value: 1500 as unknown,
  unsubscribed: 0,
}));

vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path = '') => ({ path }),
  onValue: (_ref: unknown, onNext: (snap: { val: () => unknown }) => void, onError: () => void) => {
    const snap = { val: () => h.value };
    if (h.mode === 'sync') onNext(snap);
    else if (h.mode === 'async') setTimeout(() => onNext(snap), 5);
    else if (h.mode === 'error') onError();
    return () => {
      h.unsubscribed += 1;
    };
  },
}));
vi.mock('../firebase', () => ({ app: {}, databaseUrl: 'https://example-default-rtdb.firebaseio.com', SINGLE_SESSION_ENABLED: true }));
vi.mock('firebase/firestore', () => ({}));
vi.mock('../paths', () => ({}));

import { fetchServerOffset } from '../examAttemptSession';

describe('fetchServerOffset', () => {
  beforeEach(() => {
    h.mode = 'sync';
    h.value = 1500;
    h.unsubscribed = 0;
  });

  it('answers when the database calls back at once with its cached offset, and stops listening', async () => {
    expect(await fetchServerOffset(200)).toBe(1500);
    expect(h.unsubscribed).toBe(1);
  });

  it('answers when the offset arrives later, and stops listening', async () => {
    h.mode = 'async';
    h.value = -2500;
    expect(await fetchServerOffset(200)).toBe(-2500);
    expect(h.unsubscribed).toBe(1);
  });

  it('gives up with no offset after the timeout, and on an error', async () => {
    h.mode = 'never';
    expect(await fetchServerOffset(30)).toBeNull();
    expect(h.unsubscribed).toBe(1);
    h.mode = 'error';
    expect(await fetchServerOffset(200)).toBeNull();
  });

  it('treats an offset that is not a number as no offset', async () => {
    h.value = 'soon';
    expect(await fetchServerOffset(200)).toBeNull();
  });
});
