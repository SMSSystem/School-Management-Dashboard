import { getCountFromServer, getDoc, runTransaction, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import type { ExamKeyDocument, ExamQuestionsDocument, ExamStatus } from './firebase';
import { buildAuditEntry } from './auditLog';
import { institutionCollection, institutionDoc, institutionSubcollection, institutionSubdoc } from './paths';
import {
  contentCounts,
  nextKeyRevision,
  sameAnswers,
  splitDraft,
  type BuilderQuestion,
  type EditMode,
} from './examBuilderLogic';
import { copiedContent } from './examDuplicate';
import { canTransition } from './examSettings';
import { examContentDetail, examStatusDetail, type ExamStatusAction } from './teacherAudit';

// Reading and writing an online exam's questions, answer key and status
// (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.2, §4.3, §5.2, §5.3). Every write is one batch that also holds
// the audit entry, so a change and its record stand or fall together. Which edits are allowed (editMode) is decided
// by the caller; the rules enforce who may write at all.

export type ExamActor = { uid: string; name: string };

/** Someone else saved the exam since this person opened it, so saving now would overwrite their work. */
export class ExamConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExamConflictError';
  }
}

type ExamNames = { title: string; className?: string; subjectName?: string };

const questionsRef = (institutionId: string, examId: string) => institutionSubdoc(institutionId, 'exams', examId, 'content', 'questions');
const keyRef = (institutionId: string, examId: string) => institutionSubdoc(institutionId, 'exams', examId, 'private', 'key');

/** The saved questions and key of an exam (two reads); either is null when it has not been saved yet. */
export async function loadExamContent(
  institutionId: string,
  examId: string,
): Promise<{ questions: ExamQuestionsDocument | null; key: ExamKeyDocument | null }> {
  const [q, k] = await Promise.all([getDoc(questionsRef(institutionId, examId)), getDoc(keyRef(institutionId, examId))]);
  return {
    questions: q.exists() ? (q.data() as ExamQuestionsDocument) : null,
    key: k.exists() ? (k.data() as ExamKeyDocument) : null,
  };
}

/** The saved questions only (one read), for the preview: the answer key is not read. */
export async function loadExamQuestions(institutionId: string, examId: string): Promise<ExamQuestionsDocument | null> {
  const snap = await getDoc(questionsRef(institutionId, examId));
  return snap.exists() ? (snap.data() as ExamQuestionsDocument) : null;
}

/** How many students have started the exam (one aggregate read). */
export async function countExamAttempts(institutionId: string, examId: string): Promise<number> {
  const snap = await getCountFromServer(institutionSubcollection(institutionId, 'exams', examId, 'attempts'));
  return snap.data().count;
}

function auditRef(institutionId: string) {
  return doc(institutionCollection(institutionId, 'audit_log'));
}

export type SaveContentParams = {
  institutionId: string;
  examId: string;
  exam: ExamNames & { keyRevision?: number };
  /** The edited list; in key-only mode only its correct options are used. */
  draft: readonly BuilderQuestion[];
  /** The key as it was saved, to tell whether it was corrected. */
  savedAnswers: Readonly<Record<string, readonly string[]>> | undefined;
  /** The questions document's revision as loaded (0 when there is none). */
  questionsRevision: number;
  mode: EditMode;
  actor: ExamActor;
};

/**
 * Saves the questions and the key in one transaction with the counts on the exam and an exam_edit entry. The
 * transaction first checks that nobody saved since the page was opened (the questions' revision, and the exam's key
 * revision), and refuses with an ExamConflictError rather than overwrite them. In key-only mode only the key and the
 * key revision are written: the questions document, which students may have read, is left alone. Returns what was
 * stored on the exam.
 */
export async function saveExamContent(p: SaveContentParams): Promise<{ questionCount: number; totalPoints: number; keyRevision: number }> {
  if (p.mode === 'read_only') throw new Error('This exam is finalized and cannot be edited.');
  const { questions, answers } = splitDraft(p.draft);
  const counts = contentCounts(questions);
  const keyRevision = nextKeyRevision(p.exam.keyRevision, p.mode, !sameAnswers(p.savedAnswers, answers));
  const examRef = institutionDoc(p.institutionId, 'exams', p.examId);

  await runTransaction(db, async (tx) => {
    // Reads first: what is stored now must be what this person opened.
    const examSnap = await tx.get(examRef);
    const storedKeyRevision = examSnap.exists() ? ((examSnap.data().keyRevision as number | undefined) ?? 1) : 1;
    if (storedKeyRevision !== (p.exam.keyRevision ?? 1)) {
      throw new ExamConflictError('Someone else corrected the answer key since you opened this exam. Reload the page to see their changes; your edits here are not saved.');
    }
    if (p.mode === 'full') {
      const questionsSnap = await tx.get(questionsRef(p.institutionId, p.examId));
      const storedRevision = questionsSnap.exists() ? ((questionsSnap.data().revision as number | undefined) ?? 0) : 0;
      if (storedRevision !== p.questionsRevision) {
        throw new ExamConflictError('Someone else saved the questions since you opened this exam. Reload the page to see their changes; your edits here are not saved.');
      }
      tx.set(questionsRef(p.institutionId, p.examId), {
        revision: p.questionsRevision + 1,
        updatedAt: serverTimestamp(),
        items: questions,
      });
    }
    tx.set(keyRef(p.institutionId, p.examId), {
      revision: keyRevision,
      updatedAt: serverTimestamp(),
      updatedBy: p.actor.uid,
      answers,
    });
    tx.update(examRef, {
      ...(p.mode === 'full' ? counts : {}),
      keyRevision,
    });
    tx.set(
      auditRef(p.institutionId),
      buildAuditEntry({
        institutionId: p.institutionId,
        eventType: 'exam_edit',
        detail: examContentDetail({ ...p.exam, ...counts, keyOnly: p.mode === 'key_only' }),
        targetUid: p.examId,
        targetName: p.exam.title,
        performedBy: p.actor.uid,
        performedByName: p.actor.name,
      }),
    );
  });
  return { ...counts, keyRevision };
}

export type StatusChangeParams = {
  institutionId: string;
  examId: string;
  exam: ExamNames & { status: ExamStatus; closesAtMs?: number; window?: string };
  to: ExamStatus;
  action: ExamStatusAction;
  actor: ExamActor;
  nowMs?: number;
};

/**
 * Changes an exam's status with an exam_publish entry. The change must be one the graph allows; going back to a
 * draft counts the attempts first (one read) and is refused once a student has started. Reopening is refused after
 * the window has ended.
 */
export async function setExamStatus(p: StatusChangeParams): Promise<void> {
  const nowMs = p.nowMs ?? Date.now();
  const hasAttempts = p.to === 'draft' ? (await countExamAttempts(p.institutionId, p.examId)) > 0 : false;
  if (!canTransition(p.exam.status, p.to, { hasAttempts, nowMs, closesAtMs: p.exam.closesAtMs })) {
    throw new Error(
      p.to === 'draft' && hasAttempts
        ? 'A student has already started this exam, so it cannot go back to a draft.'
        : `The exam cannot change from ${p.exam.status} to ${p.to} now.`,
    );
  }
  const batch = writeBatch(db);
  batch.update(institutionDoc(p.institutionId, 'exams', p.examId), { status: p.to });
  batch.set(
    auditRef(p.institutionId),
    buildAuditEntry({
      institutionId: p.institutionId,
      eventType: 'exam_publish',
      detail: examStatusDetail({ action: p.action, ...p.exam }),
      targetUid: p.examId,
      targetName: p.exam.title,
      performedBy: p.actor.uid,
      performedByName: p.actor.name,
    }),
  );
  await batch.commit();
}

/**
 * Copies the questions and key of one exam onto a new draft (Duplicate). It reads the source's content, then writes
 * the copy in one batch with the counts and an exam_edit entry. The new exam must already exist: the rules read the
 * exam before they allow a write under it, so this cannot share a batch with the exam's creation.
 */
export async function copyExamContent(p: {
  institutionId: string;
  sourceExamId: string;
  newExamId: string;
  exam: ExamNames;
  actor: ExamActor;
}): Promise<{ questionCount: number; totalPoints: number }> {
  const { questions, key } = await loadExamContent(p.institutionId, p.sourceExamId);
  const copy = copiedContent(questions?.items ?? [], key?.answers);
  const batch = writeBatch(db);
  batch.set(questionsRef(p.institutionId, p.newExamId), { revision: 1, updatedAt: serverTimestamp(), items: copy.questions });
  batch.set(keyRef(p.institutionId, p.newExamId), {
    revision: 1,
    updatedAt: serverTimestamp(),
    updatedBy: p.actor.uid,
    answers: copy.answers,
  });
  batch.update(institutionDoc(p.institutionId, 'exams', p.newExamId), {
    questionCount: copy.questionCount,
    totalPoints: copy.totalPoints,
  });
  batch.set(
    auditRef(p.institutionId),
    buildAuditEntry({
      institutionId: p.institutionId,
      eventType: 'exam_edit',
      detail: examContentDetail({ ...p.exam, questionCount: copy.questionCount, totalPoints: copy.totalPoints, keyOnly: false }),
      targetUid: p.newExamId,
      targetName: p.exam.title,
      performedBy: p.actor.uid,
      performedByName: p.actor.name,
    }),
  );
  await batch.commit();
  return { questionCount: copy.questionCount, totalPoints: copy.totalPoints };
}
