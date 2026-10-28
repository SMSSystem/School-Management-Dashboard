import { doc, documentId, getCountFromServer, getDoc, getDocs, query, where, writeBatch, type DocumentReference, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { buildAuditEntry } from './auditLog';
import { institutionCollection, institutionDoc, institutionSubcollection, institutionSubdoc } from './paths';
import { chunkOperations } from './deleteUserData';
import {
  EXAM_FIXED_DOCUMENTS,
  examDeleteBlockReason,
  sittingNow,
  type ExamDeleteCounts,
  type SittingAttempt,
} from './examDeleteLogic';
import { examDeleteDetail } from './teacherAudit';
import type { ExamActor } from './examContent';

// The reads and writes behind the Delete button of an online exam (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §6.9;
// the pure rules are in examDeleteLogic.ts). Firestore does not cascade, so the questions, the key and every student's
// attempt, grade and extra-time document are deleted first, in batches, and the exam document goes LAST in one batch
// with its audit entry: the rules read the exam before they allow a write under it, and a failure part-way leaves the
// exam in the list so the button can simply be pressed again. The `results` entries the exam produced are the academic
// record and are never touched.

/** Delete is refused because students are still sitting the exam; the message is for the administrator. */
export class ExamDeleteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExamDeleteBlockedError';
  }
}

const attemptsOf = (institutionId: string, examId: string) => institutionSubcollection(institutionId, 'exams', examId, 'attempts');

function sittingOf(docs: readonly QueryDocumentSnapshot[]): SittingAttempt[] {
  return docs.map((d) => {
    const data = d.data() as { status?: string; deadlineAt?: { toMillis?: () => number } };
    return { status: data.status ?? '', deadlineAtMs: data.deadlineAt?.toMillis?.() };
  });
}

/**
 * What the confirmation shows: how many attempts, grades and extra-time entries go with the exam (three aggregate
 * reads) and how many students are still sitting it (one read per attempt still in progress).
 */
export async function loadExamDeletePreflight(
  institutionId: string,
  examId: string,
  nowMs: number = Date.now(),
): Promise<{ counts: ExamDeleteCounts; sitting: number }> {
  const [attempts, grades, accommodations, packs, inProgress] = await Promise.all([
    getCountFromServer(attemptsOf(institutionId, examId)),
    getCountFromServer(institutionSubcollection(institutionId, 'exams', examId, 'grades')),
    getCountFromServer(institutionSubcollection(institutionId, 'exams', examId, 'accommodations')),
    // The picture packs are the documents of `content` whose id starts with images_ (one aggregate read, no download).
    getCountFromServer(
      query(institutionSubcollection(institutionId, 'exams', examId, 'content'), where(documentId(), '>=', 'images_'), where(documentId(), '<', 'images`')),
    ),
    getDocs(query(attemptsOf(institutionId, examId), where('status', '==', 'in_progress'))),
  ]);
  return {
    counts: {
      attempts: attempts.data().count,
      grades: grades.data().count,
      accommodations: accommodations.data().count,
      imagePacks: packs.data().count,
    },
    sitting: sittingNow(sittingOf(inProgress.docs), nowMs),
  };
}

/**
 * Deletes an exam. An online exam's questions, pictures, key, attempts, grades and extra-time entries go first (refused, before
 * anything is deleted, while a student is still sitting it), then the exam with an `exam_edit` entry. A schedule-only
 * exam is the exam document and the entry alone.
 */
export async function deleteExamCascade(p: { institutionId: string; examId: string; actor: ExamActor; nowMs?: number }): Promise<void> {
  const examRef = institutionDoc(p.institutionId, 'exams', p.examId);
  const snap = await getDoc(examRef);
  if (!snap.exists()) return;
  const exam = snap.data() as { title?: string; className?: string; subjectName?: string; online?: boolean };
  const online = exam.online === true;

  const refs: DocumentReference[] = [];
  let attempts = 0;
  let grades = 0;
  if (online) {
    const [attemptDocs, gradeDocs, accommodationDocs, contentDocs] = await Promise.all([
      getDocs(attemptsOf(p.institutionId, p.examId)),
      getDocs(institutionSubcollection(p.institutionId, 'exams', p.examId, 'grades')),
      getDocs(institutionSubcollection(p.institutionId, 'exams', p.examId, 'accommodations')),
      // Every document of `content`: the questions and the picture packs, including packs a failed save left behind.
      getDocs(institutionSubcollection(p.institutionId, 'exams', p.examId, 'content')),
    ]);
    const blocked = examDeleteBlockReason(sittingNow(sittingOf(attemptDocs.docs), p.nowMs ?? Date.now()));
    if (blocked) throw new ExamDeleteBlockedError(blocked);
    attempts = attemptDocs.size;
    grades = gradeDocs.size;
    const unique = new Map<string, DocumentReference>();
    for (const ref of [
      ...EXAM_FIXED_DOCUMENTS.map((f) => institutionSubdoc(p.institutionId, 'exams', p.examId, f.collection, f.id)),
      ...contentDocs.docs.map((d) => d.ref),
    ]) {
      unique.set(ref.path, ref);
    }
    refs.push(
      ...unique.values(),
      ...attemptDocs.docs.map((d) => d.ref),
      ...gradeDocs.docs.map((d) => d.ref),
      ...accommodationDocs.docs.map((d) => d.ref),
    );
  }

  for (const group of chunkOperations(refs)) {
    const batch = writeBatch(db);
    for (const ref of group) batch.delete(ref);
    await batch.commit();
  }

  const last = writeBatch(db);
  last.delete(examRef);
  last.set(
    doc(institutionCollection(p.institutionId, 'audit_log')),
    buildAuditEntry({
      institutionId: p.institutionId,
      eventType: 'exam_edit',
      detail: examDeleteDetail({ title: exam.title ?? '', className: exam.className, subjectName: exam.subjectName, online, attempts, grades }),
      targetUid: p.examId,
      targetName: exam.title ?? '',
      performedBy: p.actor.uid,
      performedByName: p.actor.name,
    }),
  );
  await last.commit();
}
