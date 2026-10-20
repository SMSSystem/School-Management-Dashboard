import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildRegisterRecords,
  effectiveRecordOf,
  formatDateLabel,
  formatDayLabel,
  getWeekStart,
  isCellDisabledOn,
  isOverdueSession,
  populatedSessionsOf,
  sessionKey,
  toISO,
  type DraftStore,
  type SavedRegister,
  type StudentRow,
} from '../generalAttendanceLogic';

// The General Attendance Register page's rules that need no screen or database. Written when they were
// moved out of the page, so the move is pinned to the behaviour they had.

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('dates and labels', () => {
  it('writes a date as YYYY-MM-DD in UTC', () => {
    expect(toISO(new Date('2026-10-17T23:59:00Z'))).toBe('2026-10-17');
  });

  it('starts the week on the Monday, including for a Sunday and a Saturday', () => {
    expect(toISO(getWeekStart(at('2026-10-12')))).toBe('2026-10-12'); // a Monday stays
    expect(toISO(getWeekStart(at('2026-10-14')))).toBe('2026-10-12'); // Wednesday
    expect(toISO(getWeekStart(at('2026-10-17')))).toBe('2026-10-12'); // Saturday
    expect(toISO(getWeekStart(at('2026-10-18')))).toBe('2026-10-12'); // Sunday belongs to the week before
    expect(toISO(getWeekStart(at('2026-10-19')))).toBe('2026-10-19');
  });

  it('moves a date by days, across a month end, without changing the original', () => {
    const d = at('2026-10-30');
    expect(toISO(addDays(d, 3))).toBe('2026-11-02');
    expect(toISO(addDays(d, -7))).toBe('2026-10-23');
    expect(toISO(d)).toBe('2026-10-30');
  });

  it('labels a date and its weekday in UTC', () => {
    expect(formatDateLabel('2026-10-12')).toBe('Oct 12');
    expect(formatDayLabel('2026-10-12')).toBe('Mon');
    expect(formatDayLabel('2026-10-18')).toBe('Sun');
  });

  it('keys a session by date and AM or PM', () => {
    expect(sessionKey('2026-10-12', 'AM')).toBe('2026-10-12_AM');
  });
});

const students: StudentRow[] = [
  { uid: 's1', name: 'Ada' },
  { uid: 's2', name: 'Ben' },
  { uid: 's3', name: 'Cy' },
];

const saved = (over: Partial<SavedRegister> = {}): SavedRegister =>
  ({
    id: 'r1',
    date: '2026-10-12',
    session: 'AM',
    records: { s1: { state: 'P', studentName: 'Ada' }, s2: { state: 'E', reason: 'Dentist', studentName: 'Ben' } },
    submittedAt: { seconds: 1 },
    ...over,
  }) as unknown as SavedRegister;

describe('effectiveRecordOf', () => {
  const draft: DraftStore = { '2026-10-12_AM': { s1: { state: 'A' } } };

  it('prefers the draft over what is saved', () => {
    expect(effectiveRecordOf(draft, [saved()], '2026-10-12', 'AM', 's1')).toEqual({ state: 'A' });
  });

  it("falls back to the saved mark, with its reason, for a student the draft does not hold", () => {
    expect(effectiveRecordOf(draft, [saved()], '2026-10-12', 'AM', 's2')).toEqual({ state: 'E', reason: 'Dentist' });
    expect(effectiveRecordOf(draft, [saved()], '2026-10-12', 'AM', 's1')).not.toEqual({ state: 'P' });
  });

  it('has nothing for a student marked nowhere, or in another session or day', () => {
    expect(effectiveRecordOf(draft, [saved()], '2026-10-12', 'AM', 's3')).toBeUndefined();
    expect(effectiveRecordOf({}, [saved()], '2026-10-12', 'PM', 's1')).toBeUndefined();
    expect(effectiveRecordOf({}, [saved()], '2026-10-13', 'AM', 's1')).toBeUndefined();
  });
});

describe('buildRegisterRecords', () => {
  it('saves every marked student with their name, a reason only when there is one, and skips the rest', () => {
    const marks: Record<string, { state: 'P' | 'E'; reason?: string }> = {
      s1: { state: 'P' },
      s2: { state: 'E', reason: 'Dentist' },
    };
    expect(buildRegisterRecords(students, (uid) => marks[uid])).toEqual({
      s1: { state: 'P', studentName: 'Ada' },
      s2: { state: 'E', studentName: 'Ben', reason: 'Dentist' },
    });
  });

  it('leaves out an empty reason and saves an empty register as empty', () => {
    expect(buildRegisterRecords(students, (uid) => (uid === 's1' ? { state: 'E', reason: '' } : undefined))).toEqual({
      s1: { state: 'E', studentName: 'Ada' },
    });
    expect(buildRegisterRecords(students, () => undefined)).toEqual({});
  });
});

describe('populatedSessionsOf', () => {
  it('lists the sessions with a draft, AM before PM, with how many students are still unmarked', () => {
    const draft: DraftStore = { '2026-10-12_AM': { s1: { state: 'P' } }, '2026-10-13_PM': { s1: { state: 'P' }, s2: { state: 'A' }, s3: { state: 'L' } } };
    const hasDraft = (key: string) => Object.keys(draft[key as keyof DraftStore] ?? {}).length > 0;
    const recordOf = (d: string, s: 'AM' | 'PM', uid: string) => draft[`${d}_${s}` as keyof DraftStore]?.[uid];
    expect(populatedSessionsOf(['2026-10-12', '2026-10-13'], students, hasDraft, recordOf)).toEqual([
      { dateISO: '2026-10-12', session: 'AM', emptyCount: 2 },
      { dateISO: '2026-10-13', session: 'PM', emptyCount: 0 },
    ]);
  });

  it('counts a student with a saved mark as marked, even when the draft holds only one entry', () => {
    const draft: DraftStore = { '2026-10-12_AM': { s3: { state: 'P' } } };
    const savedDocs = [saved()];
    const recordOf = (d: string, s: 'AM' | 'PM', uid: string) => effectiveRecordOf(draft, savedDocs, d, s, uid);
    const hasDraft = (key: string) => Object.keys(draft[key as keyof DraftStore] ?? {}).length > 0;
    expect(populatedSessionsOf(['2026-10-12'], students, hasDraft, recordOf)).toEqual([
      { dateISO: '2026-10-12', session: 'AM', emptyCount: 0 },
    ]);
  });

  it('is empty when nothing is drafted', () => {
    expect(populatedSessionsOf(['2026-10-12'], students, () => false, () => undefined)).toEqual([]);
  });
});

describe('isOverdueSession', () => {
  // Jamaica time is UTC-5: the AM window closes at 10:00 (15:00 UTC), the PM window at 14:00 (19:00 UTC).
  const today = '2026-10-12';
  const utc = (hhmm: string) => new Date(`2026-10-12T${hhmm}:00Z`);

  it('is never overdue for a future day', () => {
    expect(isOverdueSession('2026-10-13', 'AM', today, [], utc('22:00'))).toBe(false);
  });

  it('is overdue once the window has closed with nothing submitted, and not before', () => {
    expect(isOverdueSession(today, 'AM', today, [], utc('14:59'))).toBe(false);
    expect(isOverdueSession(today, 'AM', today, [], utc('15:00'))).toBe(true);
    expect(isOverdueSession(today, 'PM', today, [], utc('18:59'))).toBe(false);
    expect(isOverdueSession(today, 'PM', today, [], utc('19:00'))).toBe(true);
  });

  // An earlier day's window closed on that day: Friday's PM register is overdue on Monday morning too.
  // (It used to be judged by today's time of day, so it was not flagged until 14:00 Jamaica time on Monday.)
  it("is overdue for an earlier day at any time of day, until a register is submitted", () => {
    expect(isOverdueSession('2026-10-09', 'PM', today, [], utc('13:00'))).toBe(true); // 08:00 in Jamaica
    expect(isOverdueSession('2026-10-09', 'PM', today, [], utc('19:00'))).toBe(true);
    expect(isOverdueSession('2026-10-09', 'AM', today, [], utc('13:00'))).toBe(true);
    expect(isOverdueSession('2026-10-09', 'AM', today, [saved({ date: '2026-10-09' })], utc('13:00'))).toBe(false);
  });

  it('is not overdue once a register is submitted, but is while the saved one has no submit time', () => {
    expect(isOverdueSession(today, 'AM', today, [saved({ date: today })], utc('20:00'))).toBe(false);
    expect(isOverdueSession(today, 'AM', today, [saved({ date: today, submittedAt: undefined })], utc('20:00'))).toBe(true);
    expect(isOverdueSession(today, 'PM', today, [saved({ date: today })], utc('20:00'))).toBe(true); // the saved one is AM
  });
});

describe('isCellDisabledOn', () => {
  const year = { schoolWeekDays: [1, 2, 3, 4, 5] };
  const today = '2026-10-14'; // a Wednesday

  it('locks the future and any day with no academic year', () => {
    expect(isCellDisabledOn('2026-10-15', today, year, [])).toBe(true);
    expect(isCellDisabledOn('2026-10-13', today, null, [])).toBe(true);
  });

  it('locks a weekend and a non-school day, and opens a school day up to today', () => {
    expect(isCellDisabledOn('2026-10-10', today, year, [])).toBe(true); // Saturday
    expect(isCellDisabledOn('2026-10-13', today, year, [])).toBe(false);
    expect(isCellDisabledOn('2026-10-14', today, year, [])).toBe(false);
    const holiday = { type: 'single', date: '2026-10-13', isActive: true } as never;
    expect(isCellDisabledOn('2026-10-13', today, year, [holiday])).toBe(true);
    const inactive = { type: 'single', date: '2026-10-13', isActive: false } as never;
    expect(isCellDisabledOn('2026-10-13', today, year, [inactive])).toBe(false);
  });
});
