import { describe, expect, it } from 'vitest';
import {
  buildSubjectRecords,
  classesForSubjectDropdown,
  effectiveRecordOf,
  isOverdueDate,
  isSubjectSessionDay,
  needsClassSelector,
  sessionDatesOf,
  type SubjectAttendanceDoc,
} from '../subjectAttendanceLogic';
import type { NonSchoolDayDocument, SubjectDocument } from '../firebase';

// The Subject Attendance Register page's rules that need no screen or database. Written when they were moved
// out of the page, so the move is pinned to what the page did.

const subject = (over: Partial<SubjectDocument> = {}): SubjectDocument =>
  ({ name: 'Math', classScope: 'class', classIds: ['c1'], frequency: 'weekly', sessionDayOfWeek: [1], ...over }) as SubjectDocument;

const holiday = (date: string): NonSchoolDayDocument =>
  ({ type: 'single', date, reason: 'Holiday', isActive: true }) as NonSchoolDayDocument;

const WEEK_DAYS = [1, 2, 3, 4, 5];
// 2026-10-05 is a Monday
const TERM_START = '2026-10-05';

describe('isSubjectSessionDay', () => {
  it('meets on the subject’s weekdays, and only on school days', () => {
    const s = subject({ sessionDayOfWeek: [1, 3] });
    expect(isSubjectSessionDay('2026-10-05', s, TERM_START, WEEK_DAYS, [])).toBe(true); // Monday
    expect(isSubjectSessionDay('2026-10-06', s, TERM_START, WEEK_DAYS, [])).toBe(false); // Tuesday
    expect(isSubjectSessionDay('2026-10-07', s, TERM_START, WEEK_DAYS, [])).toBe(true); // Wednesday
    expect(isSubjectSessionDay('2026-10-10', subject({ sessionDayOfWeek: [6] }), TERM_START, WEEK_DAYS, [])).toBe(false); // Saturday is not a school day
  });

  it('does not meet on a non-school day', () => {
    expect(isSubjectSessionDay('2026-10-05', subject(), TERM_START, WEEK_DAYS, [holiday('2026-10-05')])).toBe(false);
  });

  it('meets only on the listed dates when the frequency is custom', () => {
    const s = subject({ frequency: 'custom', customFrequencyDays: ['2026-10-06'], sessionDayOfWeek: [1] });
    expect(isSubjectSessionDay('2026-10-06', s, TERM_START, WEEK_DAYS, [])).toBe(true);
    expect(isSubjectSessionDay('2026-10-05', s, TERM_START, WEEK_DAYS, [])).toBe(false); // a Monday, but not listed
    expect(isSubjectSessionDay('2026-10-06', subject({ frequency: 'custom' }), TERM_START, WEEK_DAYS, [])).toBe(false); // no dates listed
  });

  it('meets every other week, from the term start, when fortnightly', () => {
    const s = subject({ frequency: 'fortnightly', fortnightlyOffset: 0 });
    expect(isSubjectSessionDay('2026-10-05', s, TERM_START, WEEK_DAYS, [])).toBe(true); // week 0
    expect(isSubjectSessionDay('2026-10-12', s, TERM_START, WEEK_DAYS, [])).toBe(false); // week 1
    expect(isSubjectSessionDay('2026-10-19', s, TERM_START, WEEK_DAYS, [])).toBe(true); // week 2
    const other = subject({ frequency: 'fortnightly', fortnightlyOffset: 1 });
    expect(isSubjectSessionDay('2026-10-05', other, TERM_START, WEEK_DAYS, [])).toBe(false);
    expect(isSubjectSessionDay('2026-10-12', other, TERM_START, WEEK_DAYS, [])).toBe(true);
  });

  it('has no weekdays when none are set', () => {
    expect(isSubjectSessionDay('2026-10-05', subject({ sessionDayOfWeek: undefined }), TERM_START, WEEK_DAYS, [])).toBe(false);
  });
});

describe('sessionDatesOf', () => {
  const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];

  it('lists the dates of the week the subject meets on', () => {
    expect(sessionDatesOf(week, subject({ sessionDayOfWeek: [1, 3] }), { schoolWeekDays: WEEK_DAYS }, TERM_START, [])).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('is empty without a subject or a year', () => {
    expect(sessionDatesOf(week, null, { schoolWeekDays: WEEK_DAYS }, TERM_START, [])).toEqual([]);
    expect(sessionDatesOf(week, subject(), null, TERM_START, [])).toEqual([]);
  });
});

describe('isOverdueDate', () => {
  const today = '2026-10-12';
  const none = new Set<string>();
  const at = (hhmmUtc: string) => new Date(`2026-10-12T${hhmmUtc}:00Z`);

  it('is never overdue for a later date', () => {
    expect(isOverdueDate('2026-10-13', today, none, at('23:00'))).toBe(false);
  });

  it('is overdue for an earlier date, at any time of day, unless its register was saved', () => {
    expect(isOverdueDate('2026-10-09', today, none, at('13:00'))).toBe(true);
    expect(isOverdueDate('2026-10-09', today, new Set(['2026-10-09']), at('13:00'))).toBe(false);
  });

  it('is overdue today only from 15:00 Jamaica time (20:00 UTC), and not once saved', () => {
    expect(isOverdueDate(today, today, none, at('19:59'))).toBe(false);
    expect(isOverdueDate(today, today, none, at('20:00'))).toBe(true);
    expect(isOverdueDate(today, today, new Set([today]), at('21:00'))).toBe(false);
  });
});

describe('effectiveRecordOf', () => {
  const saved: SubjectAttendanceDoc[] = [
    { id: 'd1', sessionDate: '2026-10-05', submittedAt: 1, records: { s1: { state: 'P', studentName: 'Ada' }, s2: { state: 'E', studentName: 'Bo', reason: 'Dentist' } } },
  ];

  it('prefers the draft entry', () => {
    expect(effectiveRecordOf({ '2026-10-05': { s1: { state: 'A' } } }, saved, '2026-10-05', 's1')).toEqual({ state: 'A' });
  });

  it('falls back to what is saved, with its reason', () => {
    expect(effectiveRecordOf({}, saved, '2026-10-05', 's1')).toEqual({ state: 'P', reason: undefined });
    expect(effectiveRecordOf({ '2026-10-05': { s1: { state: 'A' } } }, saved, '2026-10-05', 's2')).toEqual({ state: 'E', reason: 'Dentist' });
  });

  it('is undefined when nothing is recorded for that student or date', () => {
    expect(effectiveRecordOf({}, saved, '2026-10-05', 's3')).toBeUndefined();
    expect(effectiveRecordOf({}, saved, '2026-10-06', 's1')).toBeUndefined();
  });
});

describe('buildSubjectRecords', () => {
  const students = [
    { uid: 's1', name: 'Ada' },
    { uid: 's2', name: 'Bo' },
    { uid: 's3', name: 'Cy' },
  ];

  it('saves each marked student with their name, the reason only when there is one, and leaves unmarked students out', () => {
    const marks: Record<string, { state: string; reason?: string }> = {
      s1: { state: 'P' },
      s2: { state: 'E', reason: 'Dentist' },
      s3: { state: 'A', reason: '' },
    };
    expect(buildSubjectRecords(students, (uid) => marks[uid])).toEqual({
      s1: { state: 'P', studentName: 'Ada' },
      s2: { state: 'E', studentName: 'Bo', reason: 'Dentist' },
      s3: { state: 'A', studentName: 'Cy' },
    });
    expect(buildSubjectRecords(students, (uid) => (uid === 's2' ? marks.s2 : undefined))).toEqual({
      s2: { state: 'E', studentName: 'Bo', reason: 'Dentist' },
    });
  });
});

describe('classesForSubjectDropdown and needsClassSelector', () => {
  const classes = [
    { id: 'c1', name: '1A', termId: 't1' },
    { id: 'c2', name: '1B', termId: 't2' },
    { id: 'c3', name: '1C', termId: 't1' },
  ];

  it('offers every class for an institution-wide subject, and the subject’s own otherwise', () => {
    expect(classesForSubjectDropdown(subject({ classScope: 'institution', classIds: [] }), classes, false, null)).toEqual(classes);
    expect(classesForSubjectDropdown(subject({ classIds: ['c1', 'c3'] }), classes, false, null).map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(classesForSubjectDropdown(null, classes, false, null)).toEqual([]);
  });

  it('narrows to the selected time block in custom mode only', () => {
    const s = subject({ classScope: 'institution', classIds: [] });
    expect(classesForSubjectDropdown(s, classes, true, { term: { id: 't1' } }).map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(classesForSubjectDropdown(s, classes, true, null)).toEqual(classes);
    expect(classesForSubjectDropdown(s, classes, false, { term: { id: 't1' } })).toEqual(classes);
  });

  it('asks for a class only when there is more than one to choose from', () => {
    expect(needsClassSelector(null)).toBe(false);
    expect(needsClassSelector(subject({ classIds: ['c1'] }))).toBe(false);
    expect(needsClassSelector(subject({ classIds: ['c1', 'c2'] }))).toBe(true);
    expect(needsClassSelector(subject({ classScope: 'institution', classIds: [] }))).toBe(true);
  });
});
