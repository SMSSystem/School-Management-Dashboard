import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { collection, doc, getCountFromServer, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import {
  EXAM,
  INST,
  KEY,
  QUESTIONS,
  as,
  assertFails,
  assertSucceeds,
  attemptDoc,
  examPath,
  gradeDoc,
  minutesFromNow,
  resetAndSeedUsers,
  seedDoc,
  seedExam,
  startEnv,
  stopEnv,
  subPath,
} from './helpers';
import { EXAM_FIXED_DOCUMENTS } from '../src/lib/examDeleteLogic';

// Deleting an online exam as the app does (src/lib/examDelete.ts, EXAMS_FEATURE_SPEC.md §6.9): the preflight reads, the
// questions, key, attempts, grades and extra-time entries first, the exam document last. The exam (helpers.ts) belongs
// to teacherA, department dept1, class A. Only administrators may delete an exam; the rules' note says to delete the
// subcollection documents before the exam document.

const results = `institutions/${INST}/results/exam_${EXAM}_studentA`;

async function seedFullExam(): Promise<void> {
  await seedExam({ status: 'closed' });
  await seedDoc(subPath('content/questions'), QUESTIONS);
  await seedDoc(subPath('private/key'), KEY);
  await seedDoc(subPath('attempts/studentA'), attemptDoc({ status: 'submitted', submittedAt: minutesFromNow(-9) }));
  await seedDoc(subPath('attempts/studentA2'), attemptDoc({ studentId: 'studentA2', status: 'in_progress' }));
  await seedDoc(subPath('grades/studentA'), gradeDoc());
  await seedDoc(subPath('accommodations/studentA'), { extraMinutes: 10, addedBy: 'teacherA', addedAt: minutesFromNow(-30) });
  await seedDoc(results, { institutionId: INST, studentId: 'studentA', examId: EXAM, teacherId: 'teacherA' });
}

// The same references examDelete.ts builds: the two fixed documents and every document of the three keyed collections.
const cascadeRefs = (uid: string) => [
  ...EXAM_FIXED_DOCUMENTS.map((f) => doc(as(uid), subPath(`${f.collection}/${f.id}`))),
  doc(as(uid), subPath('attempts/studentA')),
  doc(as(uid), subPath('attempts/studentA2')),
  doc(as(uid), subPath('grades/studentA')),
  doc(as(uid), subPath('accommodations/studentA')),
];

describe('deleting an online exam', () => {
  beforeAll(startEnv);
  afterAll(stopEnv);
  beforeEach(async () => {
    await resetAndSeedUsers();
    await seedFullExam();
  });

  it('lets an administrator read the preflight: three counts and the attempts still in progress', async () => {
    const db = as('admin');
    for (const sub of ['attempts', 'grades', 'accommodations']) {
      await assertSucceeds(getCountFromServer(collection(db, subPath(sub))));
    }
    const inProgress = await assertSucceeds(getDocs(query(collection(db, subPath('attempts')), where('status', '==', 'in_progress'))));
    expect(inProgress.size).toBe(1);
  });

  it('lets an administrator delete the five subcollections in batches and then the exam, and leaves the results entry', async () => {
    const db = as('admin');
    const first = writeBatch(db);
    for (const ref of cascadeRefs('admin')) first.delete(ref);
    await assertSucceeds(first.commit());

    const last = writeBatch(db);
    last.delete(doc(db, examPath()));
    await assertSucceeds(last.commit());

    expect((await getDoc(doc(db, examPath()))).exists()).toBe(false);
    expect((await getDoc(doc(db, subPath('attempts/studentA')))).exists()).toBe(false);
    expect((await getDoc(doc(db, results))).exists()).toBe(true);
  });

  it('lets an administrator finish after a failed first attempt: the leftovers go while the exam still exists', async () => {
    const db = as('admin');
    const partial = writeBatch(db);
    partial.delete(doc(db, subPath('attempts/studentA')));
    partial.delete(doc(db, subPath('attempts/studentA2')));
    await assertSucceeds(partial.commit());
    const rest = writeBatch(db);
    for (const ref of cascadeRefs('admin')) rest.delete(ref);
    await assertSucceeds(rest.commit());
    const last = writeBatch(db);
    last.delete(doc(db, examPath()));
    await assertSucceeds(last.commit());
  });

  it('lets an administrator clear leftovers after the exam document is already gone', async () => {
    const db = as('admin');
    const gone = writeBatch(db);
    gone.delete(doc(db, examPath()));
    await assertSucceeds(gone.commit());
    const left = writeBatch(db);
    for (const ref of cascadeRefs('admin')) left.delete(ref);
    await assertSucceeds(left.commit());
  });

  it('refuses the exam to its own teacher, a senior teacher of the department and a student', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'studentA']) {
      const batch = writeBatch(as(uid));
      batch.delete(doc(as(uid), examPath()));
      await assertFails(batch.commit());
    }
  });

  it('lets an administrator find and delete the records of one student the way Delete user does', async () => {
    const db = as('admin');
    // The online exams of the class of the student, by two equality filters, then each record by id (a missing one reads fine).
    const exams = await assertSucceeds(getDocs(query(collection(db, `institutions/${INST}/exams`), where('classId', '==', 'classA'), where('online', '==', true))));
    expect(exams.docs.map((d) => d.id)).toEqual([EXAM]);
    await assertSucceeds(getDoc(doc(db, subPath('attempts/studentB'))));
    const batch = writeBatch(db);
    for (const sub of ['attempts', 'grades', 'accommodations']) batch.delete(doc(db, subPath(`${sub}/studentA`)));
    await assertSucceeds(batch.commit());
    expect((await getDoc(doc(db, subPath('grades/studentA')))).exists()).toBe(false);
    expect((await getDoc(doc(db, subPath('attempts/studentA2')))).exists()).toBe(true);
  });

  it('refuses a student deleting an attempt, a grade or an extra-time entry', async () => {
    for (const path of ['attempts/studentA', 'grades/studentA', 'accommodations/studentA']) {
      const batch = writeBatch(as('studentA'));
      batch.delete(doc(as('studentA'), subPath(path)));
      await assertFails(batch.commit());
    }
  });

  it('refuses an administrator of another institution', async () => {
    const batch = writeBatch(as('outsiderAdmin'));
    batch.delete(doc(as('outsiderAdmin'), subPath('attempts/studentA')));
    batch.delete(doc(as('outsiderAdmin'), examPath()));
    await assertFails(batch.commit());
  });
});
