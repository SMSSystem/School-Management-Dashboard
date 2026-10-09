// Types for pruneStaleSubjectEnrollmentsLogic.mjs, so the TypeScript tests can import it.

export type EnrollmentRow = { id: string; subjectId: string; classId: string; [key: string]: unknown };
export type SubjectRow = { id: string; classScope?: string; classIds?: string[] };
export type StaleEnrollment = EnrollmentRow & { reason: 'no such subject' | 'class not in the subject' };

export function isStaleEnrollment(
  enrollment: { subjectId: string; classId: string },
  subjectsById: ReadonlyMap<string, SubjectRow>,
): boolean;
export function planPrune(
  enrollments: EnrollmentRow[],
  subjects: SubjectRow[],
): { keep: EnrollmentRow[]; stale: StaleEnrollment[] };
