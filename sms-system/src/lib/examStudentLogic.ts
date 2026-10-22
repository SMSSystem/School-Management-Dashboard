import type { ExamAttemptStatus, ExamStatus } from '@/types/exams';
import { millisOf } from './examListLogic';
import { canStartAttempt, examPhase, isPastDeadline } from './examTiming';
import { takesSubject, type ClassMembership } from './studentClasses';

// What a student or a parent sees of the exams (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.5 and §4.6): which
// exams are theirs, which of them are worth reading an attempt and a score for, the status chip and what the button
// does, and how a released score reads. Pure and Firebase-free.

const DAY_MS = 86_400_000;
/** The student's attempt and score are read only for exams open now or ended within this many days. */
export const STATUS_READ_DAYS = 14;

type ExamLike = {
  classId?: string;
  subjectId?: string;
  date?: string;
  online?: boolean;
  status?: string;
  opensAt?: unknown;
  closesAt?: unknown;
};

/** The exams of the classes a student is in, and of the subjects they take there. */
export function examsForStudent<T extends ExamLike>(exams: readonly T[], membership: ClassMembership | null | undefined): T[] {
  return exams.filter((e) => !!e.classId && takesSubject(membership, e.classId, e.subjectId ?? ''));
}

export type ChildLike = ClassMembership & { uid: string; name: string };

/** For a parent: one row per child per exam of that child's classes and subjects, soonest date first. */
export function examsForChildren<T extends ExamLike>(
  exams: readonly T[],
  children: readonly ChildLike[],
): { exam: T; child: ChildLike }[] {
  const rows = children.flatMap((child) => examsForStudent(exams, child).map((exam) => ({ exam, child })));
  return rows.sort((a, b) => (a.exam.date ?? '').localeCompare(b.exam.date ?? '') || a.child.name.localeCompare(b.child.name));
}

/**
 * Which reads are worth making for an exam in the list. An online exam that has opened and ended no more than
 * `STATUS_READ_DAYS` ago has an attempt and a score to look for (a finalized exam has no attempts left, only the
 * score); anything older or not yet open is not read, so a student with many old exams costs no reads.
 */
export function statusReads(exam: ExamLike, nowMs: number): { attempt: boolean; grade: boolean } {
  const none = { attempt: false, grade: false };
  if (exam.online !== true || exam.status === 'draft' || !exam.status) return none;
  const opens = millisOf(exam.opensAt);
  const closes = millisOf(exam.closesAt);
  if (opens === undefined || closes === undefined || nowMs < opens || nowMs > closes + STATUS_READ_DAYS * DAY_MS) return none;
  return { attempt: exam.status !== 'finalized', grade: true };
}

export type AttemptSummary = { status: ExamAttemptStatus; deadlineAtMs?: number };

export type StudentExamState = {
  label: 'Scheduled' | 'Open now' | 'In progress' | 'Submitted' | 'Result released' | 'Missed' | 'Closed';
  /** The button: start a new attempt, carry on with a running one, or look at a finished one. */
  action: 'start' | 'resume' | 'view' | null;
};

/**
 * The status chip and button for an online exam. `attempt` is the student's own attempt: undefined when it was not
 * read (an old exam), null when it was read and there is none. `released` is true once a score can be read.
 */
export function studentExamState(input: {
  exam: ExamLike & { status?: string };
  attempt: AttemptSummary | null | undefined;
  released: boolean;
  nowMs: number;
}): StudentExamState {
  const { exam, attempt, released, nowMs } = input;
  const opensAtMs = millisOf(exam.opensAt);
  const closesAtMs = millisOf(exam.closesAt);
  const phase = examPhase({ status: exam.status as ExamStatus | undefined, opensAtMs, closesAtMs }, nowMs);

  if (phase === 'draft' || phase === 'scheduled') return { label: 'Scheduled', action: null };
  if (released) return { label: 'Result released', action: 'view' };

  if (attempt?.status === 'submitted') return { label: 'Submitted', action: 'view' };
  if (attempt?.status === 'in_progress') {
    const live = attempt.deadlineAtMs === undefined || !isPastDeadline(nowMs, attempt.deadlineAtMs);
    return live ? { label: 'In progress', action: 'resume' } : { label: 'Missed', action: 'view' };
  }
  if (phase === 'open' && opensAtMs !== undefined && closesAtMs !== undefined && canStartAttempt(nowMs, { status: exam.status as ExamStatus, opensAtMs, closesAtMs })) {
    return { label: 'Open now', action: 'start' };
  }
  if (attempt === null && phase !== 'finalized') return { label: 'Missed', action: null };
  return { label: 'Closed', action: null };
}

/** A released score as the student and the parent read it. */
export function scoreView(grade: { score: number; maxScore: number; comment?: string } | null | undefined): {
  text: string;
  percent: number | null;
  comment: string;
} | null {
  if (!grade || !Number.isFinite(grade.score) || !Number.isFinite(grade.maxScore)) return null;
  return {
    text: `${grade.score} / ${grade.maxScore}`,
    percent: grade.maxScore > 0 ? Math.round((grade.score / grade.maxScore) * 100) : null,
    comment: (grade.comment ?? '').trim(),
  };
}
