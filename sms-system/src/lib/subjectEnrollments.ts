// A subject enrollment (subjectEnrollments/{subjectId}_{classId}) says "this class
// takes this subject". The My Attendance and Child Attendance "By Subject" tabs list
// every enrollment for the student's class, so an enrollment left behind after its
// subject dropped the class, or after the subject was deleted, showed a subject the
// student does not take. Pure rules, shared by those pages and mirrored in
// scripts/pruneStaleSubjectEnrollmentsLogic.mjs (a test keeps the two identical).

export type EnrollmentLike = { subjectId: string; classId: string };
export type SubjectLike = { id: string; classScope?: string; classIds?: string[] };

/**
 * True when the enrollment no longer matches its subject: the subject does not
 * exist, or it is scoped to specific classes and this class is not among them.
 * A subject for the whole institution (or an older one with no scope) enrols
 * every class, so its enrollments are never stale.
 */
export function isStaleEnrollment(enrollment: EnrollmentLike, subjectsById: ReadonlyMap<string, SubjectLike>): boolean {
  const subject = subjectsById.get(enrollment.subjectId);
  if (!subject) return true;
  if (subject.classScope === 'class') return !(subject.classIds ?? []).includes(enrollment.classId);
  return false;
}

/** The enrollments that still match their subject, in their original order. */
export function liveEnrollments<E extends EnrollmentLike>(enrollments: readonly E[], subjects: readonly SubjectLike[]): E[] {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  return enrollments.filter((e) => !isStaleEnrollment(e, byId));
}

/** The enrollment document id the Subject form writes. */
export const enrollmentDocId = (subjectId: string, classId: string): string => `${subjectId}_${classId}`;
