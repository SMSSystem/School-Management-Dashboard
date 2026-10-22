import type { ExamKeyAnswers, ExamQuestion, ExamReleaseMode, ExamScoringMode, ExamSubmitReason } from '@/types/exams';
import { EXAM_LIMITS } from '@/types/exams';
import { gradeNeedsRegrade, isReleased, needsResultSync, releaseAtFor, studentsToRelease } from './examRelease';
import { round2, scoreAttempt } from './examScoring';

// Grading an online exam in a staff browser (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §6): which attempts to
// expire and which to grade, the fields of a grade and of the `results` entry it produces, and the manual score and
// its checks. Pure and Firebase-free: the caller passes the server-time marker and a converter from milliseconds to a
// Timestamp, so the same functions build the documents the app writes and the ones the emulator tests send to the
// rules. A field with no value is left out (Firestore refuses `undefined`).

export const MANUAL_REASON_MAX = 200;
export const GRADE_COMMENT_MAX = 500;

export type AttemptForGrading = {
  studentId: string;
  studentName: string;
  classId: string;
  status: 'in_progress' | 'submitted';
  deadlineAtMs: number;
  answers?: Readonly<Record<string, readonly string[]>>;
  tabSwitches?: number;
  submittedAtMs?: number | null;
  submitReason?: ExamSubmitReason;
};

export type ExistingGrade = {
  studentId: string;
  method: 'auto' | 'manual';
  keyRevision: number;
  releaseAtMs: number | null;
  resultSynced: boolean;
  score?: number;
  tabSwitches?: number;
  submittedAtMs?: number | null;
  submitReason?: ExamSubmitReason;
};

type Markers = {
  /** The server's time as the database writes it (`serverTimestamp()`). */
  serverTime: unknown;
  /** A Timestamp from milliseconds (`Timestamp.fromMillis`). */
  timestampOf: (ms: number) => unknown;
};

/**
 * What a grading run does. An attempt still in progress well past its deadline is first marked expired (staff may do
 * this only after the deadline; the grace lets a late submit land first). Then every submitted or expired attempt that
 * has no grade is graded, and so is every one whose automatic grade was made with an older answer key. A score staff
 * entered or overrode is never touched by a run.
 */
export function planGrading(input: {
  attempts: readonly AttemptForGrading[];
  grades: readonly ExistingGrade[];
  keyRevision: number;
  nowMs: number;
}): { expire: string[]; grade: string[]; regrade: string[] } {
  const graceMs = EXAM_LIMITS.submitGraceSeconds * 1000;
  const byStudent = new Map(input.grades.map((g) => [g.studentId, g]));
  const expire: string[] = [];
  const grade: string[] = [];
  const regrade: string[] = [];
  for (const a of input.attempts) {
    const lapsed = a.status === 'in_progress' && input.nowMs > a.deadlineAtMs + graceMs;
    if (a.status === 'in_progress' && !lapsed) continue;
    if (lapsed) expire.push(a.studentId);
    const existing = byStudent.get(a.studentId);
    if (!existing) grade.push(a.studentId);
    else if (gradeNeedsRegrade(existing, input.keyRevision)) {
      grade.push(a.studentId);
      regrade.push(a.studentId);
    }
  }
  return { expire, grade, regrade };
}

type ExamForGrades = {
  releaseMode: ExamReleaseMode;
  releaseAtMs?: number | null;
  scoringMode?: ExamScoringMode;
  keyRevision: number;
};

type Grader = { uid: string; name: string };

type Release = { releaseAt: unknown; releasedNow: boolean };

/**
 * The `releaseAt` to write and whether the score is already readable. A new grade follows the exam's release mode; a
 * grade that already has a release time keeps it (a re-grade or an override does not hide or re-time a score).
 */
function releaseFor(exam: ExamForGrades, existing: ExistingGrade | undefined, nowMs: number, m: Markers): Release {
  if (existing && existing.releaseAtMs !== null) {
    return { releaseAt: m.timestampOf(existing.releaseAtMs), releasedNow: isReleased(existing.releaseAtMs, nowMs) };
  }
  if (exam.releaseMode === 'auto') return { releaseAt: m.serverTime, releasedNow: true };
  const ms = releaseAtFor(exam.releaseMode, nowMs, exam.releaseAtMs);
  return ms === null ? { releaseAt: null, releasedNow: false } : { releaseAt: m.timestampOf(ms), releasedNow: isReleased(ms, nowMs) };
}

const withoutUndefined = (fields: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

function attemptFields(src: { tabSwitches?: number; submittedAtMs?: number | null; submitReason?: ExamSubmitReason }, m: Markers) {
  return {
    tabSwitches: src.tabSwitches,
    submittedAt: typeof src.submittedAtMs === 'number' ? m.timestampOf(src.submittedAtMs) : undefined,
    submitReason: src.submitReason,
  };
}

/**
 * The automatic grade of one attempt: the score from the key, the key revision it was made with, the release time by
 * the exam's release mode, and the attempt's tab-switch count and submit time copied on so they outlive Finalize.
 * `resultSynced` is true only when the score is already released, so its `results` entry can go in the same batch.
 */
export function autoGradeFields(p: {
  institutionId: string;
  attempt: AttemptForGrading;
  questions: readonly ExamQuestion[];
  key: ExamKeyAnswers;
  exam: ExamForGrades;
  existing?: ExistingGrade;
  grader: Grader;
  nowMs: number;
  markers: Markers;
}): { fields: Record<string, unknown>; score: number; maxScore: number; releasedNow: boolean } {
  const { attempt, exam, markers: m } = p;
  const scored = scoreAttempt({
    questions: p.questions,
    answers: attempt.answers,
    key: p.key,
    scoringMode: exam.scoringMode ?? 'all_or_nothing',
  });
  const release = releaseFor(exam, p.existing, p.nowMs, m);
  return {
    score: scored.score,
    maxScore: scored.maxScore,
    releasedNow: release.releasedNow,
    fields: withoutUndefined({
      institutionId: p.institutionId,
      studentId: attempt.studentId,
      studentName: attempt.studentName,
      classId: attempt.classId,
      score: scored.score,
      maxScore: scored.maxScore,
      method: 'auto',
      gradedBy: p.grader.uid,
      gradedByName: p.grader.name,
      gradedAt: m.serverTime,
      keyRevision: exam.keyRevision,
      releaseAt: release.releaseAt,
      resultSynced: release.releasedNow,
      ...attemptFields(attempt, m),
    }),
  };
}

export type ManualGradeResult =
  | { ok: true; fields: Record<string, unknown>; score: number; maxScore: number; releasedNow: boolean }
  | { ok: false; error: string };

/**
 * A score staff enter or override. The score is from 0 to the exam's maximum (two decimals). Overriding a grade that
 * already exists needs a reason; entering a first score does not. The grade keeps its release time and the tab-switch
 * count and submit time already on it. When the score is readable at once (`releasedNow`) its `results` entry is
 * written in the same batch, so `resultSynced` is true.
 */
export function manualGradeFields(p: {
  institutionId: string;
  student: { studentId: string; studentName: string; classId: string };
  score: number;
  maxScore: number;
  reason?: string;
  comment?: string;
  existing?: ExistingGrade;
  /** The student's attempt, when there is one: its tab-switch count and submit time go on the grade, as on an automatic one. */
  attempt?: { tabSwitches?: number; submittedAtMs?: number | null; submitReason?: ExamSubmitReason };
  exam: ExamForGrades;
  grader: Grader;
  nowMs: number;
  markers: Markers;
}): ManualGradeResult {
  const score = round2(p.score);
  if (!Number.isFinite(p.score) || score < 0 || score > p.maxScore) {
    return { ok: false, error: `The score must be from 0 to ${p.maxScore}.` };
  }
  const reason = (p.reason ?? '').trim();
  if (p.existing && reason.length === 0) return { ok: false, error: 'Give a reason for changing this score.' };
  if (reason.length > MANUAL_REASON_MAX) return { ok: false, error: `The reason must be ${MANUAL_REASON_MAX} characters or fewer.` };
  const comment = (p.comment ?? '').trim();
  if (comment.length > GRADE_COMMENT_MAX) return { ok: false, error: `The comment must be ${GRADE_COMMENT_MAX} characters or fewer.` };

  const m = p.markers;
  const release = releaseFor(p.exam, p.existing, p.nowMs, m);
  // The grade keeps what it already says about the attempt; without that, what the attempt says. Without either the
  // results screen cannot tell the grade covers the attempt and reads every attempt again on each reload.
  const known = p.existing && (p.existing.tabSwitches !== undefined || p.existing.submittedAtMs !== undefined || p.existing.submitReason !== undefined);
  const carried = known ? p.existing : p.attempt;
  return {
    ok: true,
    score,
    maxScore: p.maxScore,
    releasedNow: release.releasedNow,
    fields: withoutUndefined({
      institutionId: p.institutionId,
      studentId: p.student.studentId,
      studentName: p.student.studentName,
      classId: p.student.classId,
      score,
      maxScore: p.maxScore,
      method: 'manual',
      manualReason: reason || undefined,
      comment: comment || undefined,
      gradedBy: p.grader.uid,
      gradedByName: p.grader.name,
      gradedAt: m.serverTime,
      keyRevision: p.exam.keyRevision,
      releaseAt: release.releaseAt,
      resultSynced: release.releasedNow,
      ...(carried ? attemptFields(carried, m) : {}),
    }),
  };
}

export type ExamForResult = {
  id: string;
  institutionId: string;
  termId: string;
  subjectId: string;
  classId: string;
  className: string;
  departmentId?: string;
  title?: string;
  subjectName: string;
  date: string;
};

/** The `results` document id of a student's score in an exam: fixed, so writing it twice never duplicates it. */
export const resultIdFor = (examId: string, studentUid: string) => `exam_${examId}_${studentUid}`;

/**
 * The `results` entry of a released score (the report cards average `exam` results). A new entry names the staff
 * member who writes it (the create rule requires that); an update changes only the score fields, so it never changes
 * who owns the entry (a regular teacher may update only an entry they wrote).
 */
export function resultFieldsFor(p: {
  exam: ExamForResult;
  student: { studentId: string; studentName: string };
  score: number;
  maxScore: number;
  grader: Grader;
  update: boolean;
  serverTime: unknown;
}): { id: string; fields: Record<string, unknown> } {
  const { exam } = p;
  const scores = { studentName: p.student.studentName, score: p.score, maxScore: p.maxScore };
  return {
    id: resultIdFor(exam.id, p.student.studentId),
    fields: p.update
      ? scores
      : {
          ...scores,
          studentId: p.student.studentId,
          teacherId: p.grader.uid,
          teacherName: p.grader.name,
          classId: exam.classId,
          className: exam.className,
          termId: exam.termId,
          institutionId: exam.institutionId,
          departmentId: exam.departmentId ?? '',
          subjectId: exam.subjectId,
          assessmentName: exam.title?.trim() || exam.subjectName,
          assessmentType: 'exam',
          date: exam.date,
          examId: exam.id,
          createdAt: p.serverTime,
        },
  };
}

/** Released grades whose score is not yet in `results` (run when the screen opens, after a release or a regrade). */
export function resultsToSync<G extends ExistingGrade>(grades: readonly G[], nowMs: number): G[] {
  return grades.filter((g) => needsResultSync(g, nowMs));
}

/** The students the Release button releases (graded, with no release time yet). */
export function releasePlan(grades: readonly ExistingGrade[]): string[] {
  return studentsToRelease(grades);
}

/** Whole-exam numbers for the Grade now button: can it run, and why not. */
export function gradeNowState(input: {
  autoGrade: boolean;
  canAutoGrade: boolean;
  ungraded: number;
  needsRegrade: number;
}): { enabled: boolean; reason: string | null } {
  if (!input.autoGrade) return { enabled: false, reason: 'Auto-Grade is off for this exam, so scores are entered by hand.' };
  if (!input.canAutoGrade) return { enabled: false, reason: 'The answer key is not complete, so the exam cannot be graded automatically.' };
  if (input.ungraded + input.needsRegrade === 0) return { enabled: false, reason: 'Everything submitted has been graded.' };
  return { enabled: true, reason: null };
}
