import type { Role } from './firebase';

// Who may open an online exam's builder, answer key and results (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §11). It mirrors examStaffOf in firestore.rules: an administrator, the exam's own teacher, or the senior teacher
// of the department the exam is stamped with. The rules are what enforce it; this only decides what the screens
// show. Pure and Firebase-free.

type ExamOwner = { teacherId?: string | null; departmentId?: string | null };
type Person = { uid?: string | null; role?: Role | null; departmentId?: string | null };

/** May build, grade, release and finalize this exam (and read its answer key). */
export function canManageExam(exam: ExamOwner, person: Person): boolean {
  const { role, uid, departmentId } = person;
  if (role === 'institution_admin' || role === 'super_admin') return true;
  if (role !== 'regular_teacher' && role !== 'senior_teacher') return false;
  if (uid && exam.teacherId === uid) return true;
  return role === 'senior_teacher' && !!departmentId && exam.departmentId === departmentId;
}

/** May open the builder at all: those who manage the exam, and a spectator (read only). */
export function canViewExamContent(exam: ExamOwner, person: Person): boolean {
  return person.role === 'spectator' || canManageExam(exam, person);
}
