import { Timestamp, getDoc, runTransaction, serverTimestamp, updateDoc, writeBatch, type DocumentData, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';
import { buildAuditEntry } from './auditLog';
import { institutionCollection, institutionDoc, institutionSubdoc } from './paths';
import { doc } from 'firebase/firestore';
import { attemptFrom, gradeFrom, loadAttempts, loadGrades, type LoadedAttempt, type ResultsData, type ResultsExam } from './examResultsData';
import {
  autoGradeFields,
  manualGradeFields,
  planGrading,
  releasePlan,
  resultFieldsFor,
  resultsToSync,
  type ExistingGrade,
} from './examGradingLogic';
import { extraTimePlan } from './examExtraTime';
import { millisOf } from './examListLogic';
import { finalizeBlockers } from './examRelease';
import { questionStatsFrom } from './examStats';
import { examPhase } from './examTiming';
import {
  examExtraTimeDetail,
  examFinalizeDetail,
  examGradeDetail,
  examReleaseDetail,
} from './teacherAudit';
import type { ExamQuestionStat } from '@/types/exams';

// Everything the staff results screen writes (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §6): grading a run of
// attempts, entering or overriding a score, releasing, copying released scores into `results`, extra time, and
// Finalize. Every write is a batch, an audit entry is in the last batch of an operation, and each operation can be run
// again after a failure (the documents have fixed ids and the plan is recomputed from what is stored).

export type GradingContext = {
  institutionId: string;
  exam: ResultsExam;
  actor: { uid: string; name: string };
};

// A run of students per batch: each student is a grade and possibly a results entry (two writes), well inside 500.
const STUDENTS_PER_BATCH = 200;
const DELETES_PER_BATCH = 450;

// A batch or a transaction: both queue `set` and `update`, so the same helpers serve a run of students and one student.
type Writer = {
  set(ref: DocumentReference, data: DocumentData): unknown;
  update(ref: DocumentReference, data: DocumentData): unknown;
};

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const markers = () => ({ serverTime: serverTimestamp(), timestampOf: (ms: number) => Timestamp.fromMillis(ms) });

const gradeRef = (c: GradingContext, uid: string) => institutionSubdoc(c.institutionId, 'exams', c.exam.id, 'grades', uid);
const attemptRef = (c: GradingContext, uid: string) => institutionSubdoc(c.institutionId, 'exams', c.exam.id, 'attempts', uid);
const examRef = (c: GradingContext) => institutionDoc(c.institutionId, 'exams', c.exam.id);

const names = (c: GradingContext) => ({ title: c.exam.title ?? '', className: c.exam.className, subjectName: c.exam.subjectName });

const examForGrades = (c: GradingContext) => ({
  releaseMode: c.exam.releaseMode ?? 'manual',
  releaseAtMs: millisOf(c.exam.releaseAt) ?? null,
  scoringMode: c.exam.scoringMode,
  keyRevision: c.exam.keyRevision ?? 1,
  durationMinutes: c.exam.duration,
  integrity: c.exam.integrity,
});

function addAudit(batch: Writer, c: GradingContext, eventType: 'exam_grade' | 'exam_release' | 'exam_finalize' | 'exam_edit', detail: string) {
  batch.set(
    doc(institutionCollection(c.institutionId, 'audit_log')),
    buildAuditEntry({
      institutionId: c.institutionId,
      eventType,
      detail,
      targetUid: c.exam.id,
      targetName: c.exam.title ?? '',
      performedBy: c.actor.uid,
      performedByName: c.actor.name,
    }),
  );
}

/** Queues the `results` entry of a score: created, or (when it was synced before) updated in place. */
function addResult(batch: Writer, c: GradingContext, student: { studentId: string; studentName: string }, score: number, maxScore: number, update: boolean) {
  const e = c.exam;
  const { id, fields } = resultFieldsFor({
    exam: {
      id: e.id,
      institutionId: c.institutionId,
      termId: e.termId,
      subjectId: e.subjectId,
      classId: e.classId,
      className: e.className,
      departmentId: e.departmentId,
      title: e.title,
      subjectName: e.subjectName,
      date: e.date,
    },
    student,
    score,
    maxScore,
    grader: c.actor,
    update,
    serverTime: serverTimestamp(),
  });
  const ref = institutionDoc(c.institutionId, 'results', id);
  if (update) batch.update(ref, fields);
  else batch.set(ref, fields);
}

const maxScoreOf = (c: GradingContext, data: ResultsData) =>
  c.exam.totalPoints ?? data.questions.reduce((sum, q) => sum + q.points, 0);

// ── Grading ─────────────────────────────────────────────────────────────────

export type GradeRunResult = { graded: number; expired: number; regraded: number; questionStats: Record<string, ExamQuestionStat> };

/**
 * Grades every submitted attempt that has no grade, and re-grades automatic grades made on an older key. Attempts
 * left in progress long past their deadline are marked expired first. A score staff entered is never changed. Safe to
 * run again: what is already graded is skipped. The run that happens by itself when the screen opens passes
 * `regrade: false`, so grades made on an older key stay marked "Re-grade needed" until Grade now is pressed.
 * The grades are read from the server first (one read each) so a score someone entered since the screen was loaded is
 * not overwritten; the run on opening passes `freshGrades: false`, because the screen has just read them.
 */
export async function gradeAttempts(
  c: GradingContext,
  data: ResultsData,
  opts: { regrade?: boolean; freshGrades?: boolean } = {},
): Promise<GradeRunResult> {
  const attempts = data.attempts ?? (await loadAttempts(c.institutionId, c.exam.id));
  const grades = opts.freshGrades === false ? data.grades : await loadGrades(c.institutionId, c.exam.id);
  const nowMs = Date.now();
  const keyRevision = c.exam.keyRevision ?? 1;
  const full = planGrading({ attempts, grades, keyRevision, nowMs });
  const skip = opts.regrade === false ? new Set(full.regrade) : new Set<string>();
  const plan = { expire: full.expire, grade: full.grade.filter((id) => !skip.has(id)), regrade: full.regrade.filter((id) => !skip.has(id)) };
  const expiredSet = new Set(plan.expire);
  const byStudent = new Map(attempts.map((a) => [a.studentId, a]));
  const existing = new Map<string, ExistingGrade>(grades.map((g) => [g.studentId, g]));
  const m = markers();

  for (const part of chunks(plan.expire, DELETES_PER_BATCH)) {
    const batch = writeBatch(db);
    for (const uid of part) batch.update(attemptRef(c, uid), { status: 'submitted', submitReason: 'expired' });
    await batch.commit();
  }

  const parts = chunks(plan.grade, STUDENTS_PER_BATCH);
  for (const [index, part] of parts.entries()) {
    const batch = writeBatch(db);
    for (const uid of part) {
      const base = byStudent.get(uid) as LoadedAttempt;
      const attempt = expiredSet.has(uid) ? { ...base, status: 'submitted' as const, submitReason: 'expired' as const } : base;
      const prior = existing.get(uid);
      const out = autoGradeFields({
        institutionId: c.institutionId,
        attempt,
        questions: data.questions,
        key: data.key,
        exam: examForGrades(c),
        existing: prior,
        grader: c.actor,
        nowMs,
        markers: m,
      });
      batch.set(gradeRef(c, uid), out.fields);
      if (out.releasedNow) addResult(batch, c, { studentId: uid, studentName: attempt.studentName }, out.score, out.maxScore, prior?.resultSynced === true);
    }
    if (index === parts.length - 1) {
      addAudit(batch, c, 'exam_grade', examGradeDetail({ ...names(c), kind: 'run', graded: plan.grade.length, expired: plan.expire.length, regraded: plan.regrade.length }));
    }
    await batch.commit();
  }

  const finished = attempts.filter((a) => a.status === 'submitted' || expiredSet.has(a.studentId));
  return {
    graded: plan.grade.length,
    expired: plan.expire.length,
    regraded: plan.regrade.length,
    questionStats: questionStatsFrom(finished, data.questions, data.key),
  };
}

/**
 * Enters a first score, or overrides one with a reason (the grade becomes manual and is kept by later runs). The
 * student's grade is read inside the transaction, so a score or release someone else made since the screen was loaded
 * is the one the reason and the release time are worked out from, not an old copy.
 */
export async function saveManualGrade(
  c: GradingContext,
  data: ResultsData,
  p: { studentId: string; studentName: string; score: number; reason?: string; comment?: string },
): Promise<void> {
  const maxScore = maxScoreOf(c, data);
  await runTransaction(db, async (tx) => {
    const stored = await tx.get(gradeRef(c, p.studentId));
    const prior = stored.exists() ? gradeFrom(stored.data()) : undefined;
    const out = manualGradeFields({
      institutionId: c.institutionId,
      student: { studentId: p.studentId, studentName: p.studentName, classId: c.exam.classId },
      score: p.score,
      maxScore,
      reason: p.reason,
      comment: p.comment,
      existing: prior,
      attempt: data.attempts?.find((a) => a.studentId === p.studentId),
      exam: examForGrades(c),
      grader: c.actor,
      nowMs: Date.now(),
      markers: markers(),
    });
    if (!out.ok) throw new Error(out.error);
    tx.set(gradeRef(c, p.studentId), out.fields);
    if (out.releasedNow) addResult(tx, c, p, out.score, out.maxScore, prior?.resultSynced === true);
    addAudit(tx, c, 'exam_grade', examGradeDetail({ ...names(c), kind: prior ? 'override' : 'manual', studentName: p.studentName }));
  });
}

/** Scores one student again from their attempt and the current key (also for a score that was overridden). */
export async function regradeStudent(c: GradingContext, data: ResultsData, p: { studentId: string; studentName: string }): Promise<void> {
  await runTransaction(db, async (tx) => {
    const [snap, stored] = await Promise.all([tx.get(attemptRef(c, p.studentId)), tx.get(gradeRef(c, p.studentId))]);
    if (!snap.exists()) throw new Error('This student has no attempt to grade.');
    const attempt = attemptFrom(snap.data());
    if (attempt.status !== 'submitted') throw new Error('This student has not submitted yet.');
    const prior = stored.exists() ? gradeFrom(stored.data()) : undefined;
    const out = autoGradeFields({
      institutionId: c.institutionId,
      attempt,
      questions: data.questions,
      key: data.key,
      exam: examForGrades(c),
      existing: prior,
      grader: c.actor,
      nowMs: Date.now(),
      markers: markers(),
    });
    tx.set(gradeRef(c, p.studentId), out.fields);
    if (out.releasedNow) addResult(tx, c, p, out.score, out.maxScore, prior?.resultSynced === true);
    addAudit(tx, c, 'exam_grade', examGradeDetail({ ...names(c), kind: 'regrade', studentName: p.studentName }));
  });
}

// ── Release and results ─────────────────────────────────────────────────────

/**
 * The Release button (release mode "when I press Release"): every graded score with no release time gets the server's
 * time, and its results entry is written in the same batch, so it is readable and on the report card at once. The
 * grades are read from the server first, so a score changed since the screen was loaded is the one that is released.
 */
export async function releaseGrades(c: GradingContext): Promise<number> {
  const current = await loadGrades(c.institutionId, c.exam.id);
  const ids = new Set(releasePlan(current));
  const grades = current.filter((g) => ids.has(g.studentId));
  const parts = chunks(grades, STUDENTS_PER_BATCH);
  for (const [index, part] of parts.entries()) {
    const batch = writeBatch(db);
    for (const g of part) {
      batch.update(gradeRef(c, g.studentId), { releaseAt: serverTimestamp(), resultSynced: true });
      addResult(batch, c, g, g.score, g.maxScore, g.resultSynced);
    }
    if (index === parts.length - 1) addAudit(batch, c, 'exam_release', examReleaseDetail({ ...names(c), released: grades.length, synced: grades.length }));
    await batch.commit();
  }
  return grades.length;
}

/**
 * Copies released scores that are not in `results` yet (a scheduled release that has passed). Returns how many. The
 * grades are read from the server first, except when the screen has just read them (`freshGrades: false`).
 */
export async function syncResults(c: GradingContext, data: ResultsData, opts: { freshGrades?: boolean } = {}): Promise<number> {
  const grades = opts.freshGrades === false ? data.grades : await loadGrades(c.institutionId, c.exam.id);
  const pending = resultsToSync(grades, Date.now());
  const parts = chunks(pending, STUDENTS_PER_BATCH);
  for (const [index, part] of parts.entries()) {
    const batch = writeBatch(db);
    for (const g of part) {
      batch.update(gradeRef(c, g.studentId), { resultSynced: true });
      addResult(batch, c, g, g.score, g.maxScore, false);
    }
    if (index === parts.length - 1) addAudit(batch, c, 'exam_release', examReleaseDetail({ ...names(c), released: 0, synced: pending.length }));
    await batch.commit();
  }
  return pending.length;
}

// ── Extra time ──────────────────────────────────────────────────────────────

/** Gives a student extra minutes in total, and lengthens their attempt if they are sitting it now. */
export async function addExtraTime(c: GradingContext, p: { studentId: string; studentName: string; extraMinutes: number }): Promise<void> {
  const snap = await getDoc(attemptRef(c, p.studentId));
  const attempt = snap.exists() ? attemptFrom(snap.data()) : null;
  const plan = extraTimePlan({
    extraMinutes: p.extraMinutes,
    attempt: attempt ? { status: attempt.status, deadlineAtMs: attempt.deadlineAtMs, extraMinutes: attempt.extraMinutes } : null,
  });
  if (!plan.ok) throw new Error(plan.error);
  const batch = writeBatch(db);
  batch.set(institutionSubdoc(c.institutionId, 'exams', c.exam.id, 'accommodations', p.studentId), {
    extraMinutes: plan.extraMinutes,
    addedBy: c.actor.uid,
    addedAt: serverTimestamp(),
  });
  if (plan.attempt) {
    batch.update(attemptRef(c, p.studentId), {
      deadlineAt: Timestamp.fromMillis(plan.attempt.deadlineAtMs),
      extraMinutes: plan.attempt.extraMinutes,
    });
  }
  addAudit(batch, c, 'exam_edit', examExtraTimeDetail({ ...names(c), studentName: p.studentName, extraMinutes: plan.extraMinutes }));
  await batch.commit();
}

// ── Finalize ────────────────────────────────────────────────────────────────

export class FinalizeBlockedError extends Error {
  constructor(public readonly reasons: string[]) {
    super(reasons.join(' '));
    this.name = 'FinalizeBlockedError';
  }
}

async function deleteAttempts(c: GradingContext, attempts: readonly { studentId: string }[]): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const part of chunks(attempts, DELETES_PER_BATCH)) {
    try {
      const batch = writeBatch(db);
      for (const a of part) batch.delete(attemptRef(c, a.studentId));
      await batch.commit();
      removed += part.length;
    } catch {
      failed += part.length;
    }
  }
  return { removed, failed };
}

/**
 * Finalize: every attempt is graded, every score released and in `results`, and the exam is closed. The exam document
 * is written first (status, the time, and the per-question counts, so difficulty survives), then the attempts are
 * deleted in batches; if some deletes fail the exam is already finalized and `cleanupAttempts` finishes the job.
 */
export async function finalizeExam(c: GradingContext, data: ResultsData): Promise<{ removed: number; failed: number }> {
  const nowMs = Date.now();
  const phase = examPhase({ status: c.exam.status, opensAtMs: millisOf(c.exam.opensAt), closesAtMs: millisOf(c.exam.closesAt) }, nowMs);
  if (phase !== 'closed') throw new FinalizeBlockedError(['The exam has not closed yet.']);
  const attempts = await loadAttempts(c.institutionId, c.exam.id);
  const blockers = finalizeBlockers({
    attempts: attempts.map((a) => ({ studentId: a.studentId, status: a.status, deadlineAtMs: a.deadlineAtMs })),
    grades: data.grades,
    nowMs,
  });
  if (blockers.length > 0) throw new FinalizeBlockedError(blockers.map((b) => b.message));

  const stats = questionStatsFrom(attempts, data.questions, data.key);
  // Only a closed exam can be finalized; one that closed by the clock is still stored as published.
  if (c.exam.status === 'published') await updateDoc(examRef(c), { status: 'closed' });
  const batch = writeBatch(db);
  batch.update(examRef(c), { status: 'finalized', finalizedAt: serverTimestamp(), questionStats: stats });
  addAudit(batch, c, 'exam_finalize', examFinalizeDetail({ ...names(c), attemptsRemoved: attempts.length, grades: data.grades.length }));
  await batch.commit();
  return deleteAttempts(c, attempts);
}

/** Deletes attempts left behind when Finalize could not delete them all. */
export async function cleanupAttempts(c: GradingContext): Promise<{ removed: number; failed: number }> {
  return deleteAttempts(c, await loadAttempts(c.institutionId, c.exam.id));
}
