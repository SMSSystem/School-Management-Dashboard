import { collection, getCountFromServer, getDoc, getDocs, getDocsFromServer, query, where, type DocumentData } from 'firebase/firestore';
import { db } from './firebase';
import type { ExamDocument, ExamKeyAnswers, ExamQuestion } from './firebase';
import { institutionDoc, institutionSubcollection, institutionSubdoc } from './paths';
import { loadExamContent } from './examContent';
import { millisOf } from './examListLogic';
import { needsAttemptRead, type GradeForRow, type RosterStudent } from './examResultsRows';
import type { AttemptForGrading } from './examGradingLogic';
import { takesSubject } from './studentClasses';
import { cleanEvents } from './examAttemptLogic';
import { integrityFrom } from './examActivityReport';

// Reading what the staff results screen shows (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.7 and §9): the exam,
// its questions and key, every grade, the extra times, an aggregate count of the attempts and — only when some are
// ungraded or a grade is out of date — the attempts themselves. The class roster is read separately (and cached by the
// page), because it does not change while an exam is being marked.

export type ResultsExam = ExamDocument & { id: string };

/** An attempt as the screen and the grader use it. */
export type LoadedAttempt = AttemptForGrading & {
  status: 'in_progress' | 'submitted';
  tabSwitches: number;
  extraMinutes: number;
};

export type ResultsData = {
  exam: ResultsExam;
  questions: ExamQuestion[];
  key: ExamKeyAnswers;
  grades: GradeForRow[];
  /** The attempts, or null when the grades already say everything and they were not read. */
  attempts: LoadedAttempt[] | null;
  attemptCount: number;
  /** studentUid → total extra minutes. */
  accommodations: Record<string, number>;
};

export function gradeFrom(data: DocumentData): GradeForRow {
  return {
    studentId: data.studentId,
    studentName: data.studentName ?? '',
    score: data.score,
    maxScore: data.maxScore,
    method: data.method,
    gradedByName: data.gradedByName ?? '',
    keyRevision: data.keyRevision ?? 1,
    releaseAtMs: millisOf(data.releaseAt) ?? null,
    resultSynced: data.resultSynced === true,
    ...(typeof data.tabSwitches === 'number' && { tabSwitches: data.tabSwitches }),
    ...(integrityFrom(data.integrity) && { integrity: integrityFrom(data.integrity) as NonNullable<GradeForRow['integrity']> }),
    ...(data.submittedAt && { submittedAtMs: millisOf(data.submittedAt) ?? null }),
    ...(data.submitReason && { submitReason: data.submitReason }),
    ...(data.manualReason && { manualReason: data.manualReason }),
    ...(data.comment && { comment: data.comment }),
  };
}

/** Every grade of the exam read from the server, never the local copy: what staff wrote since the screen was opened counts. */
export async function loadGrades(institutionId: string, examId: string): Promise<GradeForRow[]> {
  const snap = await getDocsFromServer(institutionSubcollection(institutionId, 'exams', examId, 'grades'));
  return snap.docs.map((d) => gradeFrom(d.data()));
}

/** One student's grade and extra time (two reads), for the screen to refresh after a change to that student alone. */
export async function loadStudentRecord(
  institutionId: string,
  examId: string,
  studentId: string,
): Promise<{ grade: GradeForRow | null; extraMinutes: number | null }> {
  const [grade, accommodation] = await Promise.all([
    getDoc(institutionSubdoc(institutionId, 'exams', examId, 'grades', studentId)),
    getDoc(institutionSubdoc(institutionId, 'exams', examId, 'accommodations', studentId)),
  ]);
  const extra = accommodation.exists() ? accommodation.data().extraMinutes : undefined;
  return {
    grade: grade.exists() ? gradeFrom(grade.data()) : null,
    extraMinutes: typeof extra === 'number' ? extra : null,
  };
}

export function attemptFrom(data: DocumentData): LoadedAttempt {
  return {
    studentId: data.studentId,
    studentName: data.studentName ?? '',
    classId: data.classId ?? '',
    status: data.status,
    deadlineAtMs: millisOf(data.deadlineAt) ?? 0,
    answers: data.answers ?? {},
    tabSwitches: typeof data.tabSwitches === 'number' ? data.tabSwitches : 0,
    extraMinutes: typeof data.extraMinutes === 'number' ? data.extraMinutes : 0,
    // An attempt from before the activity log has no `events`, so it has no summary either.
    ...(Array.isArray(data.events) && { events: cleanEvents(data.events) }),
    ...(typeof data.answeredAt === 'object' && data.answeredAt !== null && !Array.isArray(data.answeredAt) && { answeredAt: data.answeredAt as Record<string, number> }),
    submittedAtMs: millisOf(data.submittedAt) ?? null,
    submitReason: data.submitReason,
  };
}

/** Every attempt of the exam (one read each). */
export async function loadAttempts(institutionId: string, examId: string): Promise<LoadedAttempt[]> {
  const snap = await getDocs(institutionSubcollection(institutionId, 'exams', examId, 'attempts'));
  return snap.docs.map((d) => attemptFrom(d.data()));
}

/**
 * The exam, its content, the grades, the extra times and the attempt count; then the attempts too, if the grades do
 * not already account for every attempt (needsAttemptRead). A finalized exam has no attempts left to read.
 * `refuse` looks at the exam first and returns a message to stop before anything private is read (the rules would
 * refuse those reads for someone without access, with an error the person cannot act on).
 */
export async function loadResultsData(
  institutionId: string,
  examId: string,
  refuse?: (exam: ResultsExam) => string | null,
): Promise<ResultsData> {
  const examSnap = await getDoc(institutionDoc(institutionId, 'exams', examId));
  if (!examSnap.exists()) throw new Error('This exam could not be found.');
  const exam = { id: examSnap.id, ...examSnap.data() } as ResultsExam;
  const refusal = refuse?.(exam);
  if (refusal) throw new Error(refusal);

  const attemptsRef = institutionSubcollection(institutionId, 'exams', examId, 'attempts');
  const [content, gradesSnap, accSnap, countSnap] = await Promise.all([
    loadExamContent(institutionId, examId),
    getDocs(institutionSubcollection(institutionId, 'exams', examId, 'grades')),
    getDocs(institutionSubcollection(institutionId, 'exams', examId, 'accommodations')),
    getCountFromServer(attemptsRef),
  ]);
  const grades = gradesSnap.docs.map((d) => gradeFrom(d.data()));
  const accommodations: Record<string, number> = {};
  for (const d of accSnap.docs) if (typeof d.data().extraMinutes === 'number') accommodations[d.id] = d.data().extraMinutes;
  const attemptCount = countSnap.data().count;

  const keyRevision = exam.keyRevision ?? 1;
  const wanted = needsAttemptRead({
    attemptCount,
    gradedFromAttempt: grades.filter((g) => g.submittedAtMs !== undefined || g.submitReason !== undefined).length,
    needsRegrade: grades.filter((g) => g.method === 'auto' && g.keyRevision < keyRevision).length,
  });
  const attempts = wanted && exam.status !== 'finalized' && attemptCount > 0 ? await loadAttempts(institutionId, examId) : null;

  return {
    exam,
    questions: content.questions?.items ?? [],
    key: content.key?.answers ?? {},
    grades,
    attempts,
    attemptCount,
    accommodations,
  };
}

/** The students of the exam's class who take its subject (an additional-class student may take only some subjects). */
export async function loadRoster(institutionId: string, classId: string, subjectId: string): Promise<RosterStudent[]> {
  const snap = await getDocs(
    query(
      collection(db, 'users'),
      where('institutionId', '==', institutionId),
      where('role', '==', 'student'),
      where('classIds', 'array-contains', classId),
    ),
  );
  return snap.docs
    .filter((d) => takesSubject({ classId: d.data().classId, classIds: d.data().classIds, classSubjects: d.data().classSubjects }, classId, subjectId))
    .map((d) => ({ uid: d.id, name: (d.data().name as string) ?? d.id }));
}
