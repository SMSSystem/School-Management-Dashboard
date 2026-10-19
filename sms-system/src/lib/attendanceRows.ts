// What the My Attendance page (a student) and the Child Attendance page (a parent) show, built from the attendance
// documents, and the cache keys of the queries that read them. No Firebase import, so the rules are unit-tested and
// the keys can be used from the tests.
//
// The queries keep only the signed-in person's (or the child's) own rows, never the class documents they were read
// from, so another student's record is not held in the browser's cache longer than the read needs it. The keys have
// roots of their own and are not in the persisted allow-list (queryPersistence.ts).

import type { AttendanceState } from './attendanceStates';
import { isInClass, takesSubject, type ClassMembership } from './studentClasses';
import { liveEnrollments, type SubjectLike } from './subjectEnrollments';

export interface DayRow {
  date: string;
  am: AttendanceState | null;
  amReason?: string;
  pm: AttendanceState | null;
  pmReason?: string;
}

export interface SubjectSessionRow {
  date: string;
  state: AttendanceState;
  reason?: string;
}

export interface SubjectItem {
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  sessions: SubjectSessionRow[];
}

export interface EnrollmentData {
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  enrollmentType: 'all' | 'selective';
  excludedStudentIds: string[];
}

type RecordLike = { state?: string; reason?: string };
type GeneralDocLike = { date: string; session: string; records?: Record<string, RecordLike> };
type SubjectDocLike = { sessionDate?: unknown; records?: Record<string, { state: AttendanceState; reason?: string }> };

/** One row per date that has any record, with the person's AM and PM state (null when not marked). */
export function buildDayRows(docs: readonly GeneralDocLike[], uid: string): DayRow[] {
  const byDateSession = new Map<string, GeneralDocLike>();
  docs.forEach((data) => {
    byDateSession.set(`${data.date}_${data.session}`, data);
  });
  const dates = Array.from(new Set(docs.map((d) => d.date))).sort();
  return dates.map((date) => {
    const amDoc = byDateSession.get(`${date}_AM`);
    const pmDoc = byDateSession.get(`${date}_PM`);
    return {
      date,
      am: (amDoc?.records?.[uid]?.state as AttendanceState) ?? null,
      amReason: amDoc?.records?.[uid]?.reason,
      pm: (pmDoc?.records?.[uid]?.state as AttendanceState) ?? null,
      pmReason: pmDoc?.records?.[uid]?.reason,
    };
  });
}

/** The sessions of one subject at which the person has a record, oldest first. */
export function buildSubjectSessions(docs: readonly SubjectDocLike[], uid: string): SubjectSessionRow[] {
  return docs
    .flatMap((data) => {
      const record = data.records?.[uid];
      if (!record) return [] as SubjectSessionRow[];
      return [{ date: data.sessionDate as string, state: record.state, reason: record.reason }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The enrollments that apply to the person: the ones whose subject still lists the class (when the subjects could
 * be read; `null` drops nothing), in a class they are in, for a subject they take there, and, for a selective
 * enrollment, that do not exclude them.
 */
export function eligibleEnrollments(
  enrollments: readonly EnrollmentData[],
  subjects: readonly SubjectLike[] | null,
  member: ClassMembership,
  uid: string,
): EnrollmentData[] {
  const live = subjects ? liveEnrollments(enrollments, subjects) : [...enrollments];
  return live.filter(
    (e) =>
      // the home class, or an additional class for the subjects the person takes there
      isInClass(member, e.classId) &&
      takesSubject(member, e.classId, e.subjectId) &&
      (e.enrollmentType === 'all' || (e.enrollmentType === 'selective' && !e.excludedStudentIds.includes(uid))),
  );
}

/** The subject cards in name order, from the enrollments and each one's sessions. */
export function buildSubjectItems(
  eligible: readonly EnrollmentData[],
  sessionsByEnrollment: readonly SubjectSessionRow[][],
): SubjectItem[] {
  return eligible
    .map((enrollment, i) => ({
      subjectId: enrollment.subjectId,
      subjectName: enrollment.subjectName,
      classId: enrollment.classId,
      className: enrollment.className,
      sessions: sessionsByEnrollment[i] ?? [],
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

// ─── Cache keys ───────────────────────────────────────────────────────────────

export const myGeneralAttendanceKey = (institutionId: string, classId: string, uid: string, termStart: string, termEnd: string) =>
  ['myGeneralAttendance', institutionId, classId, uid, termStart, termEnd] as const;

/** Every enrollment of the institution; the Subject form's save refreshes it with the subjects. */
export const subjectEnrollmentsKey = (institutionId: string) => ['subjectEnrollments', institutionId] as const;

export const mySubjectAttendanceKey = (
  institutionId: string,
  uid: string,
  subjectId: string,
  classId: string,
  termStart: string,
  today: string,
) => ['mySubjectAttendance', institutionId, uid, subjectId, classId, termStart, today] as const;
