import { describe, expect, it } from 'vitest';
import deleteRecordRaw from '../deleteRecord.ts?raw';
import examDeleteRaw from '../examDelete.ts?raw';
import teardownRaw from '../../../scripts/teardown-bulk-institution.mjs?raw';
import countRaw from '../../../scripts/count-seed-institution.mjs?raw';
import formModalRaw from '../../components/FormModal.tsx?raw';
import listRaw from '../../scenes/(dashboard)/list/exams/index.tsx?raw';

// Source pins for deleting an exam (EXAMS_FEATURE_SPEC.md §6.9): the order of the deletes, the results that stay, and
// the person the dialog and the audit entry name. The behaviour against the rules is in rules-tests/examDeleteClient.

const norm = (s: string) => s.split('\r\n').join('\n');
const examDelete = norm(examDeleteRaw);
const deleteRecord = norm(deleteRecordRaw);
const formModal = norm(formModalRaw);
const list = norm(listRaw);

describe('deleteExamCascade', () => {
  it('deletes what hangs off the exam first, in batches, and the exam last with its audit entry', () => {
    const subs = examDelete.indexOf('for (const group of chunkOperations(refs))');
    const last = examDelete.indexOf('last.delete(examRef)');
    const audit = examDelete.indexOf("eventType: 'exam_edit'");
    expect(subs).toBeGreaterThan(-1);
    expect(last).toBeGreaterThan(subs);
    expect(audit).toBeGreaterThan(last);
    expect(examDelete.indexOf('await last.commit()')).toBeGreaterThan(audit);
  });

  it('also deletes every document of content, so the picture packs (and any a failed save left) go with the questions', () => {
    expect(examDelete).toContain("getDocs(institutionSubcollection(p.institutionId, 'exams', p.examId, 'content'))");
    expect(examDelete).toContain('...contentDocs.docs.map((d) => d.ref)');
    expect(examDelete).toContain('unique.set(ref.path, ref)'); // the questions are in both lists and are deleted once
  });

  it('counts the packs in the confirmation with one aggregate read over the images_ ids, which downloads nothing', () => {
    const preflight = examDelete.slice(examDelete.indexOf('export async function loadExamDeletePreflight'), examDelete.indexOf('export async function deleteExamCascade'));
    expect(preflight).toContain("where(documentId(), '>=', 'images_'), where(documentId(), '<', 'images`')");
    expect(preflight).toContain('imagePacks: packs.data().count');
    expect(preflight).not.toMatch(/getDocs\(institutionSubcollection\([^)]*'content'/);
  });

  it('refuses while students are sitting, before it deletes anything', () => {
    expect(examDelete.indexOf('throw new ExamDeleteBlockedError(blocked)')).toBeLessThan(examDelete.indexOf('writeBatch(db)'));
  });

  it('never touches the results the exam produced, and only does the cascade for an online exam', () => {
    expect(examDelete).not.toMatch(/'results'/);
    expect(examDelete).toContain('if (online) {');
  });
});

describe('the scripts that remove or count an online exam', () => {
  it('read every document of content, so the picture packs are drained and counted with the questions without a change', () => {
    const teardown = norm(teardownRaw);
    const count = norm(countRaw);
    expect(teardown).toContain("const EXAM_SUBCOLLECTIONS = ['content', 'private', 'attempts', 'grades', 'accommodations'];");
    expect(teardown).toContain('const docs = await examDoc.ref.collection(sub).get();');
    expect(count).toContain("const EXAM_SUBCOLLECTIONS = ['content', 'private', 'attempts', 'grades', 'accommodations'];");
    expect(teardown + count).not.toContain("'questions'");
  });
});

describe('the delete path and the dialog', () => {
  it('sends the exam to the cascade, with the person deleting it', () => {
    expect(deleteRecord).toContain('table === "exam"');
    expect(deleteRecord).toContain('await deleteExamCascade({ institutionId, examId: id, actor });');
    expect(formModal).toContain('user ? { uid: user.uid, name: displayName ?? "" } : undefined');
  });

  it('disables Delete while the counts load or students are sitting, and shows why', () => {
    expect(formModal).toContain('disabled={deleting || examBlocked}');
    expect(formModal).toContain('examDelete.sitting > 0');
    expect(formModal).toContain('<ExamDeleteNotice preflight={examDelete} />');
    expect(formModal).toContain('err instanceof ExamDeleteBlockedError ? err.message');
  });

  it('gives the list delete button the exam so the dialog knows it is online', () => {
    expect(list).toContain('<FormModal table="exam" type="delete" id={item.id} data={item as unknown as FormData} />');
  });
});
