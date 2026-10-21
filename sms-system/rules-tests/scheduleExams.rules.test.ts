import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  CLASS_A,
  EXAM,
  INST,
  anonymous,
  as,
  assertFails,
  assertSucceeds,
  examPath,
  resetAndSeedUsers,
  scheduleExam,
  seed,
  startEnv,
  stopEnv,
} from './helpers';

// The rules of a schedule-only exam (the exams page as it is today). The online-exam rules are added around these
// and must leave every case below as it is.

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seed((db) => setDoc(doc(db, examPath()), scheduleExam()));
});

describe('reading a schedule-only exam', () => {
  it('lets any signed-in user of the institution read it', async () => {
    for (const uid of ['admin', 'spectator', 'teacherB', 'seniorOther', 'studentA', 'studentB', 'parentA']) {
      await assertSucceeds(getDoc(doc(as(uid), examPath())));
    }
  });

  it('refuses someone signed in to another institution, and anyone not signed in', async () => {
    await assertFails(getDoc(doc(as('outsiderAdmin'), examPath())));
    await assertFails(getDoc(doc(anonymous(), examPath())));
  });
});

describe('creating a schedule-only exam', () => {
  const create = (uid: string, over: Record<string, unknown> = {}) =>
    setDoc(doc(as(uid), examPath(`new-${uid}`)), scheduleExam({ teacherId: uid, createdBy: uid, ...over }));

  it('lets an administrator and every teacher create one in their institution', async () => {
    for (const uid of ['admin', 'teacherA', 'seniorSame']) await assertSucceeds(create(uid));
  });

  it('refuses students, parents, the spectator and other institutions', async () => {
    for (const uid of ['studentA', 'parentA', 'spectator', 'outsiderAdmin']) await assertFails(create(uid));
  });

  it('refuses a document whose institutionId disagrees with its path', async () => {
    await assertFails(create('admin', { institutionId: 'inst2' }));
  });
});

describe('editing and deleting a schedule-only exam', () => {
  const edit = (uid: string) => updateDoc(doc(as(uid), examPath()), { room: 'Room 9' });

  it('lets an administrator, the exam’s own teacher and a senior teacher of its department edit it', async () => {
    for (const uid of ['admin', 'teacherA', 'seniorSame']) await assertSucceeds(edit(uid));
  });

  it('refuses another teacher, a senior teacher of another department, students, parents and the spectator', async () => {
    for (const uid of ['teacherB', 'seniorOther', 'studentA', 'parentA', 'spectator']) await assertFails(edit(uid));
  });

  it('lets only an administrator delete it', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'studentA', 'spectator']) await assertFails(deleteDoc(doc(as(uid), examPath())));
    await assertSucceeds(deleteDoc(doc(as('admin'), examPath())));
  });

  it('keeps the class on an unchanged exam (nothing about online exams leaks into a plain one)', async () => {
    await assertSucceeds(updateDoc(doc(as('teacherA'), examPath()), { classId: CLASS_A, duration: 60, startTime: '09:00' }));
    await assertSucceeds(getDoc(doc(as('studentA'), `institutions/${INST}/exams/${EXAM}`)));
  });
});
