import { documentId, getCountFromServer, getDoc, getDocs, query, runTransaction, serverTimestamp, where, writeBatch, doc } from 'firebase/firestore';
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
import { packCommits, packDocId, packNumberOf, packStats, planImageSave, referencesOf, withoutOrphans, type PackMap } from './examImagePack';
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
const packRef = (institutionId: string, examId: string, n: number) => institutionSubdoc(institutionId, 'exams', examId, 'content', packDocId(n));

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

/**
 * The picture packs of an exam, for staff (one read for each pack, and one query): the documents of `content` whose id is
 * images_{n}. Each keeps the revision it was written with. The questions document is not read. Staff only: a student
 * reads a pack by its id after the questions (a list is refused to them).
 */
export async function loadExamPacks(institutionId: string, examId: string): Promise<PackMap> {
  const snap = await getDocs(
    query(institutionSubcollection(institutionId, 'exams', examId, 'content'), where(documentId(), '>=', 'images_'), where(documentId(), '<', 'images`')),
  );
  const packs: PackMap = {};
  for (const d of snap.docs) {
    const n = packNumberOf(d.id);
    if (n !== null) packs[n] = { revision: (d.data().revision as number | undefined) ?? 0, images: (d.data().images ?? {}) as PackMap[number]['images'] };
  }
  return packs;
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
  /** `imagePacks` and `imageBytes` are what the exam document holds now; they decide whether the save writes them. */
  exam: ExamNames & { keyRevision?: number; imagePacks?: number; imageBytes?: number };
  /** The edited list; in key-only mode only its correct options are used. */
  draft: readonly BuilderQuestion[];
  /** The key as it was saved, to tell whether it was corrected. */
  savedAnswers: Readonly<Record<string, readonly string[]>> | undefined;
  /** The questions document's revision as loaded (0 when there is none). */
  questionsRevision: number;
  mode: EditMode;
  actor: ExamActor;
  /** The pictures as loaded and as edited (full mode only); absent when the exam has none and the builder did not load them. */
  packs?: { before: PackMap; after: PackMap };
  /** Called after each commit of packs with the packs written so far and in all ("Saving images 3 of 9"). */
  onProgress?: (done: number, total: number) => void;
};

const CHANGED_QUESTIONS =
  'Someone else saved the questions since you opened this exam. Reload the page to see their changes; your edits here are not saved.';
const CHANGED_KEY =
  'Someone else corrected the answer key since you opened this exam. Reload the page to see their changes; your edits here are not saved.';

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

  // The pictures, when there are any to save (full mode only: a key correction never touches them). The pictures nothing
  // refers to are left out, which also sweeps what an earlier failed save left behind.
  const images =
    p.mode === 'full' && p.packs
      ? planImageSave({ before: p.packs.before, after: p.packs.after, questions, hadFields: p.exam.imagePacks !== undefined || p.exam.imageBytes !== undefined })
      : null;

  // (0) Nobody saved since this page was opened, checked BEFORE a picture is written: a pack written over someone else's
  // would leave their questions pointing at a picture that is gone. The transaction below repeats the check.
  if (images && images.write.length > 0) {
    const [examSnap, questionsSnap] = await Promise.all([getDoc(examRef), getDoc(questionsRef(p.institutionId, p.examId))]);
    const storedKeyRevision = examSnap.exists() ? ((examSnap.data().keyRevision as number | undefined) ?? 1) : 1;
    if (storedKeyRevision !== (p.exam.keyRevision ?? 1)) throw new ExamConflictError(CHANGED_KEY);
    const storedRevision = questionsSnap.exists() ? ((questionsSnap.data().revision as number | undefined) ?? 0) : 0;
    if (storedRevision !== p.questionsRevision) throw new ExamConflictError(CHANGED_QUESTIONS);
  }

  // (1) The changed packs, a few to a commit so no request passes the limit. A failure stops the save here: the questions
  // were not touched, and a pack nothing refers to is swept by the next save.
  if (images && p.packs) {
    let done = 0;
    for (const group of images.commits) {
      const batch = writeBatch(db);
      for (const n of group) {
        batch.set(packRef(p.institutionId, p.examId, n), {
          revision: (p.packs.before[n]?.revision ?? 0) + 1,
          updatedAt: serverTimestamp(),
          images: images.packs[n].images,
        });
      }
      await batch.commit();
      done += group.length;
      p.onProgress?.(done, images.write.length);
    }
  }

  await runTransaction(db, async (tx) => {
    // Reads first: what is stored now must be what this person opened.
    const examSnap = await tx.get(examRef);
    const storedKeyRevision = examSnap.exists() ? ((examSnap.data().keyRevision as number | undefined) ?? 1) : 1;
    if (storedKeyRevision !== (p.exam.keyRevision ?? 1)) {
      throw new ExamConflictError(CHANGED_KEY);
    }
    if (p.mode === 'full') {
      const questionsSnap = await tx.get(questionsRef(p.institutionId, p.examId));
      const storedRevision = questionsSnap.exists() ? ((questionsSnap.data().revision as number | undefined) ?? 0) : 0;
      if (storedRevision !== p.questionsRevision) {
        throw new ExamConflictError(CHANGED_QUESTIONS);
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
      ...(images?.examFields ?? {}),
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
  // (3) The packs that are now empty, or that nothing refers to. Not part of the save: a failure here leaves harmless
  // documents that the next save removes.
  if (images && images.remove.length > 0) {
    const sweep = writeBatch(db);
    for (const n of images.remove) sweep.delete(packRef(p.institutionId, p.examId, n));
    await sweep.commit().catch(() => undefined);
  }
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
  const [{ questions, key }, sourcePacks] = await Promise.all([loadExamContent(p.institutionId, p.sourceExamId), loadExamPacks(p.institutionId, p.sourceExamId)]);
  const copy = copiedContent(questions?.items ?? [], key?.answers);

  // The pictures the copy's questions refer to, in the same packs and under the same ids, written first (a few to a
  // commit): the questions below only point at them.
  const packs = withoutOrphans(sourcePacks, referencesOf(copy.questions));
  for (const group of packCommits(Object.keys(packs).map(Number), packs)) {
    const picturesBatch = writeBatch(db);
    for (const n of group) {
      picturesBatch.set(packRef(p.institutionId, p.newExamId, n), { revision: 1, updatedAt: serverTimestamp(), images: packs[n].images });
    }
    await picturesBatch.commit();
  }
  const stats = packStats(packs);
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
    ...(stats.count > 0 && { imagePacks: stats.count, imageBytes: stats.bytes }),
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
