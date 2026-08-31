import { describe, it, expect, beforeEach } from 'vitest';
import { getPersistedFilter, setPersistedFilter, clearAllPersistedFilters } from '../filterPersistence';

// vitest runs this project's tests under the 'node' environment (no DOM), so
// sessionStorage isn't a global here — install a minimal in-memory stand-in
// that satisfies the subset of the Storage interface filterPersistence.ts uses.
function installFakeSessionStorage() {
  const store = new Map<string, string>();
  const fake: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & { length: number } = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = fake as Storage;
  return store;
}

describe('filterPersistence', () => {
  beforeEach(() => {
    installFakeSessionStorage();
  });

  it('returns an empty string when nothing is persisted', () => {
    expect(getPersistedFilter('gradebook', 'selectedClassId')).toBe('');
  });

  it('round-trips a value through set/get', () => {
    setPersistedFilter('gradebook', 'selectedClassId', 'class-1');
    expect(getPersistedFilter('gradebook', 'selectedClassId')).toBe('class-1');
  });

  it('keeps different pages/keys independent', () => {
    setPersistedFilter('gradebook', 'selectedClassId', 'class-1');
    setPersistedFilter('subject_attendance', 'selectedClassId', 'class-2');
    setPersistedFilter('gradebook', 'selectedSubjectId', 'subj-1');

    expect(getPersistedFilter('gradebook', 'selectedClassId')).toBe('class-1');
    expect(getPersistedFilter('subject_attendance', 'selectedClassId')).toBe('class-2');
    expect(getPersistedFilter('gradebook', 'selectedSubjectId')).toBe('subj-1');
  });

  it('setting an empty value removes the stored key rather than storing ""', () => {
    setPersistedFilter('gradebook', 'selectedClassId', 'class-1');
    setPersistedFilter('gradebook', 'selectedClassId', '');
    expect(getPersistedFilter('gradebook', 'selectedClassId')).toBe('');
  });

  it('clearAllPersistedFilters removes every persisted filter but nothing else', () => {
    const store = installFakeSessionStorage();
    store.set('unrelated_key', 'keep-me');
    setPersistedFilter('gradebook', 'selectedClassId', 'class-1');
    setPersistedFilter('subject_attendance', 'selectedSubjectId', 'subj-1');

    clearAllPersistedFilters();

    expect(getPersistedFilter('gradebook', 'selectedClassId')).toBe('');
    expect(getPersistedFilter('subject_attendance', 'selectedSubjectId')).toBe('');
    expect(store.get('unrelated_key')).toBe('keep-me');
  });
});
