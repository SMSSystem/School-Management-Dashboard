import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  anonymous,
  as,
  assertFails,
  assertSucceeds,
  minutesFromNow,
  resetAndSeedUsers,
  seedDoc,
  seedExam,
  startEnv,
  stopEnv,
  subPath,
} from './helpers';

// Extra time for one student (EXAMS_FEATURE_SPEC.md §5.6, §7): set by the exam's staff, readable by the student.

const path = (uid: string) => subPath(`accommodations/${uid}`);
const read = (uid: string, studentUid = 'studentA') => getDoc(doc(as(uid), path(studentUid)));

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seedExam();
  await seedDoc(path('studentA'), { extraMinutes: 15, addedBy: 'teacherA', addedAt: minutesFromNow(-30) });
});

describe('reading extra time', () => {
  it('lets the student see their own, and the exam’s staff and the spectator see it', async () => {
    for (const uid of ['studentA', 'teacherA', 'seniorSame', 'admin', 'spectator']) await assertSucceeds(read(uid));
  });

  it('hides it from other students, parents, other teachers and strangers', async () => {
    for (const uid of ['studentA2', 'studentB', 'parentA', 'teacherB', 'seniorOther', 'outsiderAdmin']) await assertFails(read(uid));
    await assertFails(getDoc(doc(anonymous(), path('studentA'))));
  });
});

describe('giving extra time', () => {
  const give = (uid: string, studentUid: string, over: Record<string, unknown> = {}) =>
    setDoc(doc(as(uid), path(studentUid)), { extraMinutes: 20, addedBy: uid, addedAt: serverTimestamp(), ...over });

  it('lets the exam’s teacher, a senior teacher of its department and an administrator set it', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'admin']) await assertSucceeds(give(uid, 'studentA2'));
  });

  it('refuses other teachers, students, parents and the spectator', async () => {
    for (const uid of ['teacherB', 'seniorOther', 'studentA', 'parentA', 'spectator']) await assertFails(give(uid, 'studentA2'));
  });

  it('keeps the amount from 1 to 120 minutes, attributed to the writer, with the server time', async () => {
    for (const extraMinutes of [0, -5, 121, 12.5]) await assertFails(give('teacherA', 'studentA2', { extraMinutes }));
    await assertSucceeds(give('teacherA', 'studentA2', { extraMinutes: 120 }));
    await assertFails(give('teacherA', 'studentA2', { addedBy: 'teacherB' }));
    await assertFails(give('teacherA', 'studentA2', { addedAt: minutesFromNow(0) }));
    await assertFails(give('teacherA', 'studentA2', { note: 'extra' }));
  });

  it('can be removed by the exam’s staff and not by the student', async () => {
    await assertFails(deleteDoc(doc(as('studentA'), path('studentA'))));
    await assertFails(deleteDoc(doc(as('teacherB'), path('studentA'))));
    await assertSucceeds(deleteDoc(doc(as('teacherA'), path('studentA'))));
  });
});
