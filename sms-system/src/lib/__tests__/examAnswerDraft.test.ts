import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXAM_DRAFT_TTL_MS,
  clearAllExamDrafts,
  clearExamDraft,
  dropForeignExamDrafts,
  readExamDraft,
  writeExamDraft,
} from '../examAnswerDraft';
import { purgeSession } from '../sessionPurge';
import { queryClient } from '../queryClient';
import { createFakeStorage } from './fakeStorage';
import authRaw from '../AuthContext.tsx?raw';

// A student's answers kept in the browser between checkpoints (EXAMS_FEATURE_SPEC.md §4.5).

const draft = { answers: { q1: ['a'] }, flags: ['q2'], tabSwitches: 2, baseLastSavedMs: 5000 };
let storage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  storage = createFakeStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('sessionStorage', createFakeStorage());
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe('exam answer drafts', () => {
  it('round-trips a draft for the same account, institution and exam', () => {
    writeExamDraft('uid-a', 'inst', 'exam1', draft);
    expect(readExamDraft('uid-a', 'inst', 'exam1')).toEqual(draft);
  });

  it('keeps the activity log and the answer times, and loads a backup made before they existed', () => {
    const withLog = { ...draft, events: [{ t: 12, k: 'hidden' as const, d: 30 }, { t: 40, k: 'copy' as const }], answeredAt: { q1: 8 } };
    writeExamDraft('uid-a', 'inst', 'exam1', withLog);
    expect(readExamDraft('uid-a', 'inst', 'exam1')).toEqual(withLog);
    writeExamDraft('uid-a', 'inst', 'exam2', draft);
    const old = readExamDraft('uid-a', 'inst', 'exam2');
    expect(old).toEqual(draft);
    expect(old && 'events' in old).toBe(false);
  });

  it('drops a malformed log or answer times and keeps the answers', () => {
    writeExamDraft('uid-a', 'inst', 'exam1', draft);
    const key = storage.key(0) as string;
    storage.setItem(
      key,
      JSON.stringify({ ...draft, savedAt: Date.now(), events: [{ t: 'x', k: 1 }, { t: 3, k: 'blur', d: 2 }], answeredAt: { q1: 'soon' } }),
    );
    expect(readExamDraft('uid-a', 'inst', 'exam1')).toEqual({ ...draft, events: [{ t: 3, k: 'blur', d: 2 }] });
    storage.setItem(key, JSON.stringify({ ...draft, savedAt: Date.now(), events: 'none', answeredAt: [1] }));
    expect(readExamDraft('uid-a', 'inst', 'exam1')).toEqual(draft);
  });

  it('never returns another account’s, institution’s or exam’s draft', () => {
    writeExamDraft('uid-a', 'inst', 'exam1', draft);
    expect(readExamDraft('uid-b', 'inst', 'exam1')).toBeNull();
    expect(readExamDraft('uid-a', 'other', 'exam1')).toBeNull();
    expect(readExamDraft('uid-a', 'inst', 'exam2')).toBeNull();
  });

  it('reads and writes nothing without a signed-in account', () => {
    writeExamDraft('', 'inst', 'exam1', draft);
    expect(storage.length).toBe(0);
    expect(readExamDraft('', 'inst', 'exam1')).toBeNull();
  });

  it('expires after 24 hours and removes the stale entry', () => {
    writeExamDraft('uid-a', 'inst', 'exam1', draft, 1_000);
    expect(readExamDraft('uid-a', 'inst', 'exam1', 1_000 + EXAM_DRAFT_TTL_MS)).not.toBeNull();
    expect(readExamDraft('uid-a', 'inst', 'exam1', 1_000 + EXAM_DRAFT_TTL_MS + 1)).toBeNull();
    expect(storage.length).toBe(0);
  });

  it('drops a malformed entry instead of throwing', () => {
    for (const bad of ['not json', '{"savedAt":1}', JSON.stringify({ savedAt: Date.now(), answers: { q: 'x' }, flags: [], tabSwitches: 0, baseLastSavedMs: 1 })]) {
      storage.setItem('exam_answers:uid-a:inst:exam1', bad);
      expect(readExamDraft('uid-a', 'inst', 'exam1')).toBeNull();
    }
  });

  it('clears one draft', () => {
    writeExamDraft('uid-a', 'inst', 'exam1', draft);
    writeExamDraft('uid-a', 'inst', 'exam2', draft);
    clearExamDraft('uid-a', 'inst', 'exam1');
    expect(readExamDraft('uid-a', 'inst', 'exam1')).toBeNull();
    expect(readExamDraft('uid-a', 'inst', 'exam2')).not.toBeNull();
  });

  it('clears every draft of every account and nothing else', () => {
    writeExamDraft('uid-a', 'inst', 'exam1', draft);
    writeExamDraft('uid-b', 'inst', 'exam1', draft);
    storage.setItem('sidebar-collapsed', '1');
    clearAllExamDrafts();
    expect(storage.dump()).toEqual({ 'sidebar-collapsed': '1' });
  });

  it('drops the drafts of other accounts at sign-in but keeps the account’s own', () => {
    writeExamDraft('uid-a', 'inst', 'exam1', draft);
    writeExamDraft('uid-b', 'inst', 'exam1', draft);
    dropForeignExamDrafts('uid-a');
    expect(readExamDraft('uid-a', 'inst', 'exam1')).not.toBeNull();
    expect(readExamDraft('uid-b', 'inst', 'exam1')).toBeNull();
  });

  it('does not throw when storage is full or blocked', () => {
    vi.stubGlobal('localStorage', {
      get length(): number { throw new Error('denied'); },
      key() { throw new Error('denied'); },
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('denied'); },
    });
    expect(() => writeExamDraft('uid-a', 'inst', 'e', draft)).not.toThrow();
    expect(readExamDraft('uid-a', 'inst', 'e')).toBeNull();
    expect(() => clearAllExamDrafts()).not.toThrow();
    expect(() => dropForeignExamDrafts('uid-a')).not.toThrow();
  });
});

describe('signing out and in', () => {
  it('purgeSession removes the exam drafts of everyone', () => {
    writeExamDraft('uid-a', 'inst', 'exam1', draft);
    purgeSession();
    expect(storage.dump()).toEqual({});
  });

  it('AuthContext drops other accounts’ drafts at sign-in', () => {
    const auth = authRaw.split('\r\n').join('\n');
    expect(auth).toContain('dropForeignExamDrafts(firebaseUser.uid);');
  });
});
