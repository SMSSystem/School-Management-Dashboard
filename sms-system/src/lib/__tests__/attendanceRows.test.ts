import { describe, expect, it } from 'vitest';
import {
  buildDayRows,
  buildSubjectItems,
  buildSubjectSessions,
  eligibleEnrollments,
  mySubjectAttendanceKey,
  myGeneralAttendanceKey,
  subjectEnrollmentsKey,
  type EnrollmentData,
} from '../attendanceRows';
import { isPersistableQueryKey } from '../queryPersistence';

const day = (date: string, session: 'AM' | 'PM', records: Record<string, { state: string; reason?: string }>) => ({ date, session, records });

describe('buildDayRows', () => {
  it('gives one row per date, oldest first, with the person’s AM and PM', () => {
    const rows = buildDayRows(
      [
        day('2026-09-02', 'PM', { me: { state: 'A' }, other: { state: 'P' } }),
        day('2026-09-01', 'AM', { me: { state: 'P' } }),
        day('2026-09-01', 'PM', { me: { state: 'E', reason: 'dentist' } }),
        day('2026-09-02', 'AM', { me: { state: 'L' } }),
      ],
      'me',
    );
    expect(rows).toEqual([
      { date: '2026-09-01', am: 'P', amReason: undefined, pm: 'E', pmReason: 'dentist' },
      { date: '2026-09-02', am: 'L', amReason: undefined, pm: 'A', pmReason: undefined },
    ]);
  });

  it('leaves a session null when it was not marked, or the person has no record in it', () => {
    const rows = buildDayRows([day('2026-09-01', 'AM', { other: { state: 'P' } })], 'me');
    expect(rows).toEqual([{ date: '2026-09-01', am: null, amReason: undefined, pm: null, pmReason: undefined }]);
  });

  it('survives a document with no records map', () => {
    expect(buildDayRows([{ date: '2026-09-01', session: 'AM' }], 'me')[0].am).toBeNull();
  });

  it('is empty for no documents', () => {
    expect(buildDayRows([], 'me')).toEqual([]);
  });

  it('never carries another person’s record into a row', () => {
    const rows = buildDayRows([day('2026-09-01', 'AM', { me: { state: 'P' }, other: { state: 'A', reason: 'secret' } })], 'me');
    expect(JSON.stringify(rows)).not.toContain('secret');
  });
});

describe('buildSubjectSessions', () => {
  it('keeps only the sessions with a record for the person, oldest first', () => {
    const sessions = buildSubjectSessions(
      [
        { sessionDate: '2026-09-03', records: { me: { state: 'P' } } },
        { sessionDate: '2026-09-01', records: { me: { state: 'A', reason: 'x' } } },
        { sessionDate: '2026-09-02', records: { other: { state: 'P' } } },
        { sessionDate: '2026-09-04' },
      ],
      'me',
    );
    expect(sessions).toEqual([
      { date: '2026-09-01', state: 'A', reason: 'x' },
      { date: '2026-09-03', state: 'P', reason: undefined },
    ]);
  });
});

const enr = (subjectId: string, classId: string, extra: Partial<EnrollmentData> = {}): EnrollmentData => ({
  subjectId,
  subjectName: subjectId.toUpperCase(),
  classId,
  className: classId,
  enrollmentType: 'all',
  excludedStudentIds: [],
  ...extra,
});

describe('eligibleEnrollments', () => {
  const subjects = [{ id: 'math' }, { id: 'art', classScope: 'class', classIds: ['c1'] }, { id: 'pe' }];

  it('keeps enrollments of the home class, and of an additional class only for the subjects taken there', () => {
    const member = { classId: 'c1', classIds: ['c1', 'c2'], classSubjects: { c2: ['pe'] } };
    const out = eligibleEnrollments([enr('math', 'c1'), enr('math', 'c2'), enr('pe', 'c2'), enr('pe', 'c3')], subjects, member, 'me');
    expect(out.map((e) => `${e.subjectId}@${e.classId}`)).toEqual(['math@c1', 'pe@c2']);
  });

  it('drops an enrollment whose subject is gone or no longer lists the class', () => {
    const member = { classId: 'c2', classIds: ['c2'], classSubjects: {} };
    const out = eligibleEnrollments([enr('art', 'c2'), enr('gone', 'c2'), enr('math', 'c2')], subjects, member, 'me');
    expect(out.map((e) => e.subjectId)).toEqual(['math']);
  });

  it('drops nothing when the subjects could not be read', () => {
    const member = { classId: 'c1', classIds: ['c1'], classSubjects: {} };
    expect(eligibleEnrollments([enr('gone', 'c1')], null, member, 'me')).toHaveLength(1);
  });

  it('honours a selective enrollment that excludes the person', () => {
    const member = { classId: 'c1', classIds: ['c1'], classSubjects: {} };
    const out = eligibleEnrollments(
      [enr('math', 'c1', { enrollmentType: 'selective', excludedStudentIds: ['me'] }), enr('pe', 'c1', { enrollmentType: 'selective', excludedStudentIds: ['other'] })],
      subjects,
      member,
      'me',
    );
    expect(out.map((e) => e.subjectId)).toEqual(['pe']);
  });
});

describe('buildSubjectItems', () => {
  it('pairs each enrollment with its sessions and sorts by subject name', () => {
    const items = buildSubjectItems([enr('math', 'c1'), enr('art', 'c1')], [[{ date: 'd1', state: 'P' }], []]);
    expect(items.map((i) => [i.subjectName, i.sessions.length])).toEqual([['ART', 0], ['MATH', 1]]);
  });
});

describe('the attendance query keys', () => {
  it('carry the person and the term, so one person’s rows never serve another', () => {
    expect(myGeneralAttendanceKey('i', 'c', 'u1', 's', 'e')).not.toEqual(myGeneralAttendanceKey('i', 'c', 'u2', 's', 'e'));
    expect(myGeneralAttendanceKey('i', 'c', 'u', 's1', 'e')).not.toEqual(myGeneralAttendanceKey('i', 'c', 'u', 's2', 'e'));
    expect(mySubjectAttendanceKey('i', 'u1', 'sub', 'c', 's', 't')).not.toEqual(mySubjectAttendanceKey('i', 'u2', 'sub', 'c', 's', 't'));
  });

  it('start a new window each day for the subject sessions, which run up to today', () => {
    expect(mySubjectAttendanceKey('i', 'u', 'sub', 'c', 's', '2026-09-01')).not.toEqual(mySubjectAttendanceKey('i', 'u', 'sub', 'c', 's', '2026-09-02'));
  });

  it('are not persisted: attendance rows and the enrollments’ exclusion lists stay in memory', () => {
    expect(isPersistableQueryKey(myGeneralAttendanceKey('i', 'c', 'u', 's', 'e'))).toBe(false);
    expect(isPersistableQueryKey(mySubjectAttendanceKey('i', 'u', 'sub', 'c', 's', 't'))).toBe(false);
    expect(isPersistableQueryKey(subjectEnrollmentsKey('i'))).toBe(false);
  });
});
