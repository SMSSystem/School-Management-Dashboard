import { describe, expect, it } from 'vitest';
import deleteRecordRaw from '../deleteRecord.ts?raw';
import examDeleteRaw from '../examDelete.ts?raw';
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

  it('refuses while students are sitting, before it deletes anything', () => {
    expect(examDelete.indexOf('throw new ExamDeleteBlockedError(blocked)')).toBeLessThan(examDelete.indexOf('writeBatch(db)'));
  });

  it('never touches the results the exam produced, and only does the cascade for an online exam', () => {
    expect(examDelete).not.toMatch(/'results'/);
    expect(examDelete).toContain('if (online) {');
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
