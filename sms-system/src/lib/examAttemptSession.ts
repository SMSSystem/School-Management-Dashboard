import { Timestamp, getDoc, getDocFromServer, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { app, databaseUrl, SINGLE_SESSION_ENABLED } from './firebase';
import type {
  ExamAttemptDocument,
  ExamDocument,
  ExamGradeDocument,
  ExamQuestion,
  ExamQuestionsDocument,
} from './firebase';
import { institutionDoc, institutionSubdoc } from './paths';
import { errorCode } from './reportError';
import { cleanOffset, hasTimeToStart, startDeadlineMs } from './examClock';
import { checkpointFields, newAttemptFields, submitFields } from './examAttemptLogic';
import { newAttemptSeed } from './examShuffle';

// A student's attempt, from the Firestore side (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.5, §5.4, §7): the
// server's clock, the reads that open the start screen, and the three writes (start, checkpoint, submit). The fields
// come from examAttemptLogic and are the ones the attempt rules accept. Nothing here listens live.

export type StudentExam = ExamDocument & { id: string };

const attemptRef = (institutionId: string, examId: string, uid: string) =>
  institutionSubdoc(institutionId, 'exams', examId, 'attempts', uid);

/**
 * serverNow − clientNow in ms from the Realtime Database's `.info/serverTimeOffset`, or null when that is not
 * available (the single-session database is off, or it did not answer in time). The connection is the one the session
 * lock already holds, so this costs nothing.
 */
export async function fetchServerOffset(timeoutMs = 3000): Promise<number | null> {
  if (!SINGLE_SESSION_ENABLED || !databaseUrl) return null;
  try {
    const mod = await import('firebase/database');
    const database = mod.getDatabase(app, databaseUrl);
    return await new Promise<number | null>((resolve) => {
      // The database holds the offset once the session lock has connected, and then calls back before onValue has
      // returned its unsubscribe function, so the unsubscribe is used only if it exists and otherwise after the call.
      const state: { settled: boolean; unsubscribe?: () => void; timer?: ReturnType<typeof setTimeout> } = { settled: false };
      const finish = (value: number | null) => {
        if (state.settled) return;
        state.settled = true;
        clearTimeout(state.timer);
        state.unsubscribe?.();
        resolve(value);
      };
      state.timer = setTimeout(() => finish(null), timeoutMs);
      state.unsubscribe = mod.onValue(
        mod.ref(database, '.info/serverTimeOffset'),
        (snap) => finish(cleanOffset(snap.val())),
        () => finish(null),
      );
      if (state.settled) state.unsubscribe();
    });
  } catch {
    return null;
  }
}

export async function loadStudentExam(institutionId: string, examId: string): Promise<StudentExam | null> {
  const snap = await getDoc(institutionDoc(institutionId, 'exams', examId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as StudentExam) : null;
}

/** The extra minutes a teacher gave this student (0 when there are none). */
export async function loadMyAccommodation(institutionId: string, examId: string, uid: string): Promise<number> {
  const snap = await getDoc(institutionSubdoc(institutionId, 'exams', examId, 'accommodations', uid));
  const extra = snap.exists() ? snap.data().extraMinutes : 0;
  return typeof extra === 'number' ? extra : 0;
}

/** The student's own attempt, or null when they have not started. */
export async function loadMyAttempt(institutionId: string, examId: string, uid: string): Promise<ExamAttemptDocument | null> {
  const snap = await getDoc(attemptRef(institutionId, examId, uid));
  return snap.exists() ? (snap.data() as ExamAttemptDocument) : null;
}

/**
 * The deadline stored on the student's own attempt, read from the server (never the local copy, which holds the
 * deadline this browser wrote): staff may have lengthened it by giving extra time. Throws when the server cannot be
 * reached; null when there is no attempt.
 */
export async function loadMyDeadline(institutionId: string, examId: string, uid: string): Promise<number | null> {
  const snap = await getDocFromServer(attemptRef(institutionId, examId, uid));
  const deadline = snap.exists() ? (snap.data() as ExamAttemptDocument).deadlineAt : undefined;
  return deadline ? deadline.toMillis() : null;
}

/** The questions (no answers). The rules let a student read them only while the exam is published and inside the window. */
export async function loadAttemptQuestions(institutionId: string, examId: string): Promise<ExamQuestionsDocument | null> {
  const snap = await getDoc(institutionSubdoc(institutionId, 'exams', examId, 'content', 'questions'));
  return snap.exists() ? (snap.data() as ExamQuestionsDocument) : null;
}

/**
 * A released score, by id. The rules refuse the read (permission-denied, for a missing document as well) until the
 * score has been released, so a refusal means "nothing to show yet" and comes back as null.
 */
export async function loadGrade(institutionId: string, examId: string, studentUid: string): Promise<ExamGradeDocument | null> {
  try {
    const snap = await getDoc(institutionSubdoc(institutionId, 'exams', examId, 'grades', studentUid));
    return snap.exists() ? (snap.data() as ExamGradeDocument) : null;
  } catch (err) {
    if (errorCode(err) === 'permission-denied') return null;
    throw err;
  }
}

export class NoTimeToStartError extends Error {
  constructor() {
    super('There is not enough time left in the window to start this exam.');
    this.name = 'NoTimeToStartError';
  }
}

/**
 * Starts the attempt: the deadline is worked out from the server's time, the order is made (shuffled when the exam
 * shuffles), the document is created with the server's time as its start, and the stored copy is read back so the
 * caller has the real `startedAt` and `deadlineAt`. Throws NoTimeToStartError when under 30 seconds would be left.
 */
export async function startAttempt(p: {
  institutionId: string;
  exam: StudentExam;
  uid: string;
  studentName: string;
  extraMinutes: number;
  offsetMs: number | null;
}): Promise<ExamAttemptDocument> {
  const { exam } = p;
  const clientNowMs = Date.now();
  const deadlineMs = startDeadlineMs({
    clientNowMs,
    offsetMs: p.offsetMs,
    durationMinutes: exam.duration ?? 0,
    extraMinutes: p.extraMinutes,
    closesAtMs: exam.closesAt?.toMillis() ?? 0,
  });
  if (!hasTimeToStart(deadlineMs, clientNowMs + (p.offsetMs ?? 0))) throw new NoTimeToStartError();

  const ref = attemptRef(p.institutionId, exam.id, p.uid);
  await setDoc(
    ref,
    newAttemptFields({
      institutionId: p.institutionId,
      uid: p.uid,
      studentName: p.studentName,
      classId: exam.classId,
      startedAt: serverTimestamp(),
      deadlineAt: Timestamp.fromMillis(deadlineMs),
      lastSavedAt: serverTimestamp(),
      extraMinutes: p.extraMinutes,
      seed: newAttemptSeed(),
    }),
  );
  return (await getDocFromServer(ref)).data() as ExamAttemptDocument;
}

type AnswerState = {
  institutionId: string;
  examId: string;
  uid: string;
  questions: readonly ExamQuestion[];
  answers: Readonly<Record<string, readonly string[]>>;
  flags: readonly string[];
  tabSwitches: number;
};

/** A checkpoint: the answers, flags, tab count and the save time. */
export async function saveCheckpoint(p: AnswerState): Promise<void> {
  await updateDoc(
    attemptRef(p.institutionId, p.examId, p.uid),
    checkpointFields({ ...p, lastSavedAt: serverTimestamp() }),
  );
}

/** The final save: ends the attempt (`student` when they pressed Submit, `timeout` when the time ran out). */
export async function submitAttempt(p: AnswerState & { reason: 'student' | 'timeout' }): Promise<void> {
  await updateDoc(
    attemptRef(p.institutionId, p.examId, p.uid),
    submitFields({ ...p, serverTime: serverTimestamp() }),
  );
}
