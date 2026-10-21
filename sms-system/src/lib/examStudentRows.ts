import { examRowInfo } from './examListLogic';
import {
  examsForStudent,
  scoreView,
  statusReads,
  studentExamState,
  type AttemptSummary,
  type ChildLike,
} from './examStudentLogic';
import type { ClassMembership } from './studentClasses';

// The rows of the student's and the parent's Exams list (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.5 and
// §4.6): one row per exam for a student, one per child per exam for a parent, with the status, the button and the
// released score. Pure and Firebase-free; the attempts and scores come in as maps the page has read.

export type ExamListDoc = {
  id: string;
  classId?: string;
  subjectId?: string;
  subjectName?: string;
  title?: string;
  date?: string;
  startTime?: string;
  duration?: number;
  valueType?: string;
  valueTypeLabel?: string;
  online?: boolean;
  status?: string;
  opensAt?: unknown;
  closesAt?: unknown;
};

export type GradeSummary = { score: number; maxScore: number; comment?: string };

/** `${examId}:${studentUid}` — the key of both maps. */
export const statusKey = (examId: string, studentUid: string) => `${examId}:${studentUid}`;

export type StatusMaps = {
  /** undefined key: not read. null: read, and there is none. */
  attempts: ReadonlyMap<string, AttemptSummary | null>;
  grades: ReadonlyMap<string, GradeSummary | null>;
};

export type Pair<T> = { exam: T; studentUid: string; child: { uid: string; name: string } | null };

type Who =
  | { role: 'student'; uid: string; membership: ClassMembership | null | undefined }
  | { role: 'parent'; children: readonly ChildLike[] };

/** Which exams belong in the list, and for whom: a student's own, or each of a parent's children. */
export function listPairs<T extends ExamListDoc>(exams: readonly T[], who: Who): Pair<T>[] {
  if (who.role === 'student') {
    return examsForStudent(exams, who.membership).map((exam) => ({ exam, studentUid: who.uid, child: null }));
  }
  return who.children.flatMap((child) =>
    examsForStudent(exams, child).map((exam) => ({ exam, studentUid: child.uid, child: { uid: child.uid, name: child.name } })),
  );
}

/** The reads worth making for these rows (see statusReads): a parent never reads an attempt. */
export function statusTargets<T extends ExamListDoc>(
  pairs: readonly Pair<T>[],
  role: 'student' | 'parent',
  nowMs: number,
): { examId: string; studentUid: string; attempt: boolean; grade: boolean }[] {
  return pairs.flatMap((p) => {
    const reads = statusReads(p.exam, nowMs);
    const attempt = role === 'student' && reads.attempt;
    return attempt || reads.grade ? [{ examId: p.exam.id, studentUid: p.studentUid, attempt, grade: reads.grade }] : [];
  });
}

export type StudentListRow<T> = {
  key: string;
  exam: T;
  child: { uid: string; name: string } | null;
  title: string;
  online: boolean;
  /** The chip: a student's own status, a parent's Scheduled / Open / Closed, null for a schedule-only exam. */
  status: string | null;
  /** What the button does (students only). */
  action: 'start' | 'resume' | 'view' | null;
  result: ReturnType<typeof scoreView>;
};

/** The rows, most recent date first, then by child name. */
export function studentListRows<T extends ExamListDoc>(
  pairs: readonly Pair<T>[],
  role: 'student' | 'parent',
  maps: StatusMaps,
  nowMs: number,
): StudentListRow<T>[] {
  const rows = pairs.map((p): StudentListRow<T> => {
    const key = statusKey(p.exam.id, p.studentUid);
    const info = examRowInfo(p.exam, nowMs, 'student_parent');
    const grade = maps.grades.get(key) ?? null;
    const result = scoreView(grade);
    const base = { key: p.child ? key : p.exam.id, exam: p.exam, child: p.child, title: info.title, online: info.online, result };
    if (!info.online) return { ...base, status: null, action: null };
    if (role === 'parent') return { ...base, status: result ? 'Result released' : info.status, action: null };
    const state = studentExamState({ exam: p.exam, attempt: maps.attempts.get(key), released: result !== null, nowMs });
    return { ...base, status: state.label, action: state.action };
  });
  return rows.sort((a, b) => (b.exam.date ?? '').localeCompare(a.exam.date ?? '') || (a.child?.name ?? '').localeCompare(b.child?.name ?? ''));
}
