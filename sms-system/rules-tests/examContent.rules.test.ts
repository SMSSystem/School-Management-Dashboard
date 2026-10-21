import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  KEY,
  QUESTIONS,
  anonymous,
  as,
  assertFails,
  assertSucceeds,
  examPath,
  minutesFromNow,
  resetAndSeedUsers,
  seed,
  seedDoc,
  seedExam,
  startEnv,
  stopEnv,
  subPath,
} from './helpers';

// The questions and the answer key of an online exam (EXAMS_FEATURE_SPEC.md §5.2, §5.3, §7): the questions are
// readable inside the window by a student of the class; the key is staff only.

const QUESTIONS_PATH = subPath('content/questions');
const KEY_PATH = subPath('private/key');
const read = (uid: string, path: string) => getDoc(doc(as(uid), path));

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seedExam();
  await seedDoc(QUESTIONS_PATH, QUESTIONS);
  await seedDoc(KEY_PATH, KEY);
});

describe('reading the questions', () => {
  it('lets a student of the class read them inside the window, including one with the class as an additional class', async () => {
    await assertSucceeds(read('studentA', QUESTIONS_PATH));
    await assertSucceeds(read('studentA2', QUESTIONS_PATH));
    await assertSucceeds(read('studentBplusA', QUESTIONS_PATH));
  });

  it('refuses a student of another class, a parent, someone from another institution and anyone not signed in', async () => {
    await assertFails(read('studentB', QUESTIONS_PATH));
    await assertFails(read('parentA', QUESTIONS_PATH));
    await assertFails(read('outsiderAdmin', QUESTIONS_PATH));
    await assertFails(getDoc(doc(anonymous(), QUESTIONS_PATH)));
  });

  it('refuses a student before the window opens, while the exam is a draft, and once it is closed or finalized', async () => {
    await seedExam({ opensAt: minutesFromNow(10), closesAt: minutesFromNow(90) });
    await assertFails(read('studentA', QUESTIONS_PATH));
    for (const status of ['draft', 'closed', 'finalized']) {
      await seedExam({ status });
      await assertFails(read('studentA', QUESTIONS_PATH));
    }
  });

  it('keeps them readable for two hours after the close (extra time), and not after that', async () => {
    await seedExam({ opensAt: minutesFromNow(-200), closesAt: minutesFromNow(-100) });
    await assertSucceeds(read('studentA', QUESTIONS_PATH));
    await seedExam({ opensAt: minutesFromNow(-300), closesAt: minutesFromNow(-130) });
    await assertFails(read('studentA', QUESTIONS_PATH));
  });

  it('lets the exam’s staff, any administrator and the spectator read them at any time, but not other teachers', async () => {
    await seedExam({ status: 'draft', opensAt: minutesFromNow(600), closesAt: minutesFromNow(700) });
    for (const uid of ['teacherA', 'seniorSame', 'admin', 'spectator']) await assertSucceeds(read(uid, QUESTIONS_PATH));
    for (const uid of ['teacherB', 'seniorOther']) await assertFails(read(uid, QUESTIONS_PATH));
  });
});

describe('writing the questions', () => {
  const next = { revision: 2, updatedAt: serverTimestamp(), items: QUESTIONS.items };
  const write = (uid: string, data: Record<string, unknown>) => setDoc(doc(as(uid), QUESTIONS_PATH), data);

  it('lets the exam’s teacher, a senior teacher of its department and an administrator save them', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'admin']) await assertSucceeds(write(uid, next));
  });

  it('refuses another teacher, another department’s senior teacher, students, parents and the spectator', async () => {
    for (const uid of ['teacherB', 'seniorOther', 'studentA', 'parentA', 'spectator']) await assertFails(write(uid, next));
  });

  it('needs the server time, a revision, a list of at most 100 questions and no other fields', async () => {
    await assertFails(write('teacherA', { ...next, updatedAt: minutesFromNow(-1) }));
    await assertFails(write('teacherA', { ...next, revision: 'two' }));
    await assertFails(write('teacherA', { ...next, items: 'none' }));
    await assertFails(write('teacherA', { ...next, items: Array.from({ length: 101 }, (_, i) => ({ id: `q${i}` })) }));
    await assertSucceeds(write('teacherA', { ...next, items: Array.from({ length: 100 }, (_, i) => ({ id: `q${i}` })) }));
    await assertFails(write('teacherA', { ...next, answers: { q1: ['a'] } }));
  });

  it('lets staff delete them and refuses students', async () => {
    await assertFails(deleteDoc(doc(as('studentA'), QUESTIONS_PATH)));
    await assertFails(deleteDoc(doc(as('teacherB'), QUESTIONS_PATH)));
    await assertSucceeds(deleteDoc(doc(as('teacherA'), QUESTIONS_PATH)));
  });
});

describe('the answer key', () => {
  it('is readable by the exam’s staff and the spectator only, never by a student, a parent or another teacher', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'admin', 'spectator']) await assertSucceeds(read(uid, KEY_PATH));
    for (const uid of ['studentA', 'studentA2', 'studentBplusA', 'parentA', 'teacherB', 'seniorOther', 'outsiderAdmin']) {
      await assertFails(read(uid, KEY_PATH));
    }
    await assertFails(getDoc(doc(anonymous(), KEY_PATH)));
  });

  it('stays hidden from students even while the exam is open and after it closes', async () => {
    await seedExam({ status: 'closed' });
    await assertFails(read('studentA', KEY_PATH));
    await seedExam({ status: 'finalized' });
    await assertFails(read('studentA', KEY_PATH));
  });

  const next = { revision: 2, updatedAt: serverTimestamp(), updatedBy: 'teacherA', answers: { q1: ['b'], q2: ['a'] } };
  const write = (uid: string, data: Record<string, unknown>) => setDoc(doc(as(uid), KEY_PATH), data);

  it('is written by the exam’s staff, as themselves, with the server time', async () => {
    await assertSucceeds(write('teacherA', next));
    await assertSucceeds(write('seniorSame', { ...next, updatedBy: 'seniorSame' }));
    await assertSucceeds(write('admin', { ...next, updatedBy: 'admin' }));
    await assertFails(write('teacherA', { ...next, updatedBy: 'teacherB' }));
    await assertFails(write('teacherA', { ...next, updatedAt: minutesFromNow(-1) }));
  });

  it('is refused to everyone else, and refuses a malformed key', async () => {
    for (const uid of ['teacherB', 'seniorOther', 'studentA', 'parentA', 'spectator']) {
      await assertFails(write(uid, { ...next, updatedBy: uid }));
    }
    await assertFails(write('teacherA', { ...next, answers: ['a'] }));
    await assertFails(write('teacherA', { ...next, extra: true }));
  });
});

describe('the leftovers of a deleted exam', () => {
  it('can still be deleted by an administrator, but not by a teacher', async () => {
    await seed(async (db) => {
      await deleteDoc(doc(db, examPath()));
    });
    await assertFails(deleteDoc(doc(as('teacherA'), KEY_PATH)));
    await assertSucceeds(deleteDoc(doc(as('admin'), KEY_PATH)));
    await assertSucceeds(deleteDoc(doc(as('admin'), QUESTIONS_PATH)));
  });
});
