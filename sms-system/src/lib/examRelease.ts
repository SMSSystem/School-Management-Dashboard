import { EXAM_LIMITS, type ExamReleaseMode } from '@/types/exams';
import type { ExamIssue } from './examKeyValidation';

// When a student and their parents may see an online exam's score, and what must be true before an exam is
// finalized (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §6.5 to §6.8). Pure and Firebase-free; times are
// milliseconds since 1970. A score is readable only when the grade's `releaseAt` has passed: firestore.rules
// compares `releaseAt <= request.time`, and isReleased() is the same test for the screens.

/**
 * The `releaseAt` to store on a new grade. As soon as graded: the grading time. At a set time: the exam's release
 * time (null if it has none, which keeps the grade hidden). When the teacher presses Release: null until then.
 */
export function releaseAtFor(
  mode: ExamReleaseMode,
  gradedAtMs: number,
  examReleaseAtMs: number | null | undefined,
): number | null {
  if (mode === 'auto') return gradedAtMs;
  if (mode === 'scheduled') return examReleaseAtMs ?? null;
  return null;
}

/** Has the score been released? Mirrors the grades read rule (`releaseAt != null && releaseAt <= request.time`). */
export function isReleased(releaseAtMs: number | null | undefined, nowMs: number): boolean {
  return releaseAtMs !== null && releaseAtMs !== undefined && releaseAtMs <= nowMs;
}

type GradeLike = {
  method: 'auto' | 'manual';
  keyRevision: number;
  releaseAtMs: number | null | undefined;
  resultSynced: boolean;
};

/**
 * Was this grade computed with an older answer key? Only automatic grades are re-graded by "Grade now": a score a
 * teacher entered or overrode is kept until they ask for that student to be re-graded.
 */
export function gradeNeedsRegrade(grade: Pick<GradeLike, 'method' | 'keyRevision'>, currentKeyRevision: number): boolean {
  return grade.method === 'auto' && grade.keyRevision < currentKeyRevision;
}

/** Is the score released but not yet copied into `results`? (Report cards do not see it until it is.) */
export function needsResultSync(grade: Pick<GradeLike, 'releaseAtMs' | 'resultSynced'>, nowMs: number): boolean {
  return isReleased(grade.releaseAtMs, nowMs) && !grade.resultSynced;
}

/** The students whose grades the teacher's Release button releases: graded, with no release time yet. */
export function studentsToRelease(grades: readonly { studentId: string; releaseAtMs: number | null | undefined }[]): string[] {
  return grades.filter((g) => g.releaseAtMs === null || g.releaseAtMs === undefined).map((g) => g.studentId);
}

const blocker = (code: string, message: string): ExamIssue => ({ code, message });

/**
 * What stops an exam from being finalized (finalizing deletes the attempts): attempts still running, submitted or
 * expired attempts that have no grade, grades not yet released, and released grades not yet in `results`. An
 * attempt still `in_progress` past its deadline plus the grace counts as needing a grade (staff mark it expired).
 */
export function finalizeBlockers(input: {
  attempts: readonly { studentId: string; status: 'in_progress' | 'submitted'; deadlineAtMs: number }[];
  grades: readonly (GradeLike & { studentId: string })[];
  nowMs: number;
}): ExamIssue[] {
  const graded = new Set(input.grades.map((g) => g.studentId));
  const graceMs = EXAM_LIMITS.submitGraceSeconds * 1000;
  let running = 0;
  let ungraded = 0;
  for (const a of input.attempts) {
    const expired = a.status === 'in_progress' && input.nowMs > a.deadlineAtMs + graceMs;
    if (a.status === 'in_progress' && !expired) running += 1;
    else if (!graded.has(a.studentId)) ungraded += 1;
  }
  const unreleased = input.grades.filter((g) => !isReleased(g.releaseAtMs, input.nowMs)).length;
  const unsynced = input.grades.filter((g) => isReleased(g.releaseAtMs, input.nowMs) && !g.resultSynced).length;

  const out: ExamIssue[] = [];
  if (running > 0) out.push(blocker('attempts_running', `${running} attempt${running === 1 ? ' is' : 's are'} still in progress.`));
  if (ungraded > 0) out.push(blocker('ungraded', `${ungraded} submitted attempt${ungraded === 1 ? ' has' : 's have'} no grade yet.`));
  if (unreleased > 0) out.push(blocker('unreleased', `${unreleased} score${unreleased === 1 ? ' has' : 's have'} not been released.`));
  if (unsynced > 0) out.push(blocker('unsynced', `${unsynced} released score${unsynced === 1 ? ' is' : 's are'} not yet in the results.`));
  return out;
}
