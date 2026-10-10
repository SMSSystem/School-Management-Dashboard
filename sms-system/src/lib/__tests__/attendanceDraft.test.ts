import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFT_TTL_MS,
  clearAllDrafts,
  clearDraft,
  clearSubjectDraft,
  dropForeignDrafts,
  getDraft,
  getSubjectDraft,
  purgeExpiredDrafts,
  setDraftCell,
  setDraftOwner,
  setSubjectDraftCell,
} from '../attendanceDraft';
import { createFakeStorage } from './fakeStorage';

const P = { state: 'P' } as const;
const E = { state: 'E', reason: 'Dentist' } as const;

let storage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  storage = createFakeStorage();
  vi.stubGlobal('localStorage', storage);
  setDraftOwner('uid-a');
});

afterEach(() => {
  setDraftOwner(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('attendance drafts: ownership', () => {
  it('round-trips a general draft for the signed-in user', () => {
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', P);
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's2', E);
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({ s1: P, s2: E });
  });

  it('does not read or write anything without a signed-in owner', () => {
    setDraftOwner(null);
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', P);
    expect(storage.length).toBe(0);
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({});
  });

  it('never returns another user draft', () => {
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', E);
    setDraftOwner('uid-b');
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({});
  });

  it('keeps subject drafts separate from general drafts', () => {
    setSubjectDraftCell('inst', 'sub1', 'c1', '2026-10-05', 's1', P);
    expect(getSubjectDraft('inst', 'sub1', 'c1', '2026-10-05')).toEqual({ s1: P });
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({});
    clearSubjectDraft('inst', 'sub1', 'c1', '2026-10-05');
    expect(getSubjectDraft('inst', 'sub1', 'c1', '2026-10-05')).toEqual({});
  });

  it('clearDraft removes one register only', () => {
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', P);
    setDraftCell('inst', 'c1', '2026-10-05', 'PM', 's1', P);
    clearDraft('inst', 'c1', '2026-10-05', 'AM');
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({});
    expect(getDraft('inst', 'c1', '2026-10-05', 'PM')).toEqual({ s1: P });
  });
});

describe('attendance drafts: expiry', () => {
  it('drops a draft older than the TTL on read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T08:00:00Z'));
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', E);
    vi.setSystemTime(new Date(Date.now() + DRAFT_TTL_MS + 1));
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({});
    expect(storage.length).toBe(0);
  });

  it('purgeExpiredDrafts removes only this user drafts dated before the term start', () => {
    setDraftCell('inst', 'c1', '2026-08-01', 'AM', 's1', P); // before the term
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', P); // in the term
    setSubjectDraftCell('inst', 'sub1', 'c1', '2026-08-02', 's1', P); // subject, before
    setSubjectDraftCell('inst', 'sub1', 'c1', '2026-10-06', 's1', P); // subject, in the term
    purgeExpiredDrafts('2026-09-01');
    expect(getDraft('inst', 'c1', '2026-08-01', 'AM')).toEqual({});
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({ s1: P });
    expect(getSubjectDraft('inst', 'sub1', 'c1', '2026-08-02')).toEqual({});
    expect(getSubjectDraft('inst', 'sub1', 'c1', '2026-10-06')).toEqual({ s1: P });
  });
});

describe('attendance drafts: wiping', () => {
  it('clearAllDrafts removes every user and the old key format, and nothing else', () => {
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', P);
    setDraftOwner('uid-b');
    setSubjectDraftCell('inst', 'sub1', 'c1', '2026-10-05', 's1', P);
    storage.setItem('attendance_draft_inst_c1_2026-10-05_AM', '{"s1":{"state":"P"}}');
    storage.setItem('attendance_draft_subject_inst_sub1_c1_2026-10-05', '{}');
    storage.setItem('sidebar-collapsed', '1');
    clearAllDrafts();
    expect(storage.dump()).toEqual({ 'sidebar-collapsed': '1' });
  });

  it('dropForeignDrafts keeps the signed-in user drafts and removes everyone else', () => {
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', P); // uid-a
    setDraftOwner('uid-b');
    setDraftCell('inst', 'c1', '2026-10-05', 'AM', 's1', E); // uid-b
    storage.setItem('attendance_draft_inst_c1_2026-10-05_AM', '{}'); // legacy, no uid
    dropForeignDrafts('uid-a');
    setDraftOwner('uid-a');
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({ s1: P });
    setDraftOwner('uid-b');
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({});
    expect(storage.getItem('attendance_draft_inst_c1_2026-10-05_AM')).toBeNull();
  });

  it('ignores a malformed or old-format value instead of throwing', () => {
    const key = 'attendance_draft:uid-a:general:inst_c1_2026-10-05_AM';
    storage.setItem(key, '{"s1":{"state":"P"}}');
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({});
    storage.setItem(key, 'not json');
    expect(getDraft('inst', 'c1', '2026-10-05', 'AM')).toEqual({});
  });
});
