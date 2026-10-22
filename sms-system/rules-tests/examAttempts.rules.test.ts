import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  CLASS_B,
  INST,
  anonymous,
  as,
  assertFails,
  assertSucceeds,
  attemptDoc,
  minutesFromNow,
  resetAndSeedUsers,
  seedDoc,
  seedExam,
  startEnv,
  stopEnv,
  subPath,
} from './helpers';

// A student's attempt (EXAMS_FEATURE_SPEC.md §5.4, §7): one per student, started inside the window on the server
// clock, saved and submitted before the deadline, and read by the student and the exam's staff only.

const attemptPath = (uid: string) => subPath(`attempts/${uid}`);

// What a student writes to start: server time for the start, a deadline at most start + duration (30 min).
const start = (over: Record<string, unknown> = {}) => ({
  institutionId: INST,
  studentId: 'studentA',
  studentName: 'Student A',
  classId: 'classA',
  status: 'in_progress',
  startedAt: serverTimestamp(),
  deadlineAt: minutesFromNow(25),
  extraMinutes: 0,
  seed: 'abcdef0123456789',
  answers: {},
  flags: [],
  tabSwitches: 0,
  lastSavedAt: serverTimestamp(),
  ...over,
});
const begin = (uid: string, data: Record<string, unknown>) => setDoc(doc(as(uid), attemptPath(uid)), data);

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seedExam();
});

describe('the seed of a new attempt', () => {
  it('is a string of 8 to 64 characters, and the old order map is no longer accepted', async () => {
    await assertFails(begin('studentA', start({ seed: 'short' })));
    await assertFails(begin('studentA', start({ seed: 'x'.repeat(65) })));
    await assertFails(begin('studentA', start({ seed: 12345678 })));
    const withoutSeed: Record<string, unknown> = start();
    delete withoutSeed.seed;
    await assertFails(begin('studentA', withoutSeed));
    await assertFails(begin('studentA', { ...withoutSeed, order: { questions: ['q1'], options: { q1: ['a'] } } }));
    await assertSucceeds(begin('studentA', start({ seed: 'x'.repeat(64) })));
  });

  it('cannot be changed by a checkpoint', async () => {
    await assertSucceeds(begin('studentA', start()));
    await assertFails(updateDoc(doc(as('studentA'), attemptPath('studentA')), { seed: 'another-seed-1234', lastSavedAt: serverTimestamp() }));
  });
});

describe('starting an attempt', () => {
  it('lets a student of the class start inside the window, including through an additional class', async () => {
    await assertSucceeds(begin('studentA', start()));
    await assertSucceeds(begin('studentBplusA', start({ studentId: 'studentBplusA' })));
  });

  it('refuses a student of another class, a student starting for someone else, and staff, parents and the spectator', async () => {
    await assertFails(begin('studentB', start({ studentId: 'studentB', classId: CLASS_B })));
    await assertFails(setDoc(doc(as('studentA'), attemptPath('studentA2')), start({ studentId: 'studentA2' })));
    for (const uid of ['teacherA', 'admin', 'parentA', 'spectator']) await assertFails(begin(uid, start({ studentId: uid })));
    await assertFails(setDoc(doc(anonymous(), attemptPath('studentA')), start()));
  });

  it('refuses a start outside the window, or when the exam is not published', async () => {
    await seedExam({ opensAt: minutesFromNow(5), closesAt: minutesFromNow(90) });
    await assertFails(begin('studentA', start()));
    await seedExam({ opensAt: minutesFromNow(-90), closesAt: minutesFromNow(-5) });
    await assertFails(begin('studentA', start({ deadlineAt: minutesFromNow(-10) })));
    for (const status of ['draft', 'closed', 'finalized']) {
      await seedExam({ status });
      await assertFails(begin('studentA', start()));
    }
  });

  it('needs the server time for the start and the first save', async () => {
    await assertFails(begin('studentA', start({ startedAt: minutesFromNow(-3) })));
    await assertFails(begin('studentA', start({ lastSavedAt: minutesFromNow(-3) })));
  });

  it('caps the deadline at start + duration, and at the close of the window', async () => {
    await assertSucceeds(begin('studentA', start({ deadlineAt: minutesFromNow(29) })));
    await assertFails(setDoc(doc(as('studentA2'), attemptPath('studentA2')), start({ studentId: 'studentA2', deadlineAt: minutesFromNow(31) })));
    // The window closes in 10 minutes, so a 30-minute exam cannot run past that.
    await seedExam({ closesAt: minutesFromNow(10) });
    await assertFails(begin('studentBplusA', start({ studentId: 'studentBplusA', deadlineAt: minutesFromNow(25) })));
    await assertSucceeds(begin('studentBplusA', start({ studentId: 'studentBplusA', deadlineAt: minutesFromNow(9) })));
    await assertFails(begin('studentA2', start({ studentId: 'studentA2', deadlineAt: minutesFromNow(-1) })));
  });

  it('gives a student their extra time, and only theirs', async () => {
    await seedDoc(subPath('accommodations/studentA'), { extraMinutes: 15, addedBy: 'teacherA', addedAt: minutesFromNow(-60) });
    await assertFails(begin('studentA', start({ extraMinutes: 0, deadlineAt: minutesFromNow(40) })));
    await assertFails(begin('studentA', start({ extraMinutes: 15, deadlineAt: minutesFromNow(50) })));
    await assertSucceeds(begin('studentA', start({ extraMinutes: 15, deadlineAt: minutesFromNow(44) })));
    // studentA2 has none: claiming extra minutes is refused.
    await assertFails(begin('studentA2', start({ studentId: 'studentA2', extraMinutes: 15, deadlineAt: minutesFromNow(40) })));
  });

  it('refuses a start that already has answers, flags or tab switches, unknown fields, or another student’s identity', async () => {
    await assertFails(begin('studentA', start({ answers: { q1: ['a'] } })));
    await assertFails(begin('studentA', start({ flags: ['q1'] })));
    await assertFails(begin('studentA', start({ tabSwitches: 2 })));
    await assertFails(begin('studentA', start({ status: 'submitted' })));
    await assertFails(begin('studentA', start({ score: 2 })));
    await assertFails(begin('studentA', start({ studentId: 'studentA2' })));
    await assertFails(begin('studentA', start({ classId: CLASS_B })));
    await assertFails(begin('studentA', start({ institutionId: 'inst2' })));
  });

  it('cannot be done a second time', async () => {
    await assertSucceeds(begin('studentA', start()));
    await assertFails(begin('studentA', start({ startedAt: serverTimestamp(), deadlineAt: minutesFromNow(28) })));
  });
});

describe('saving and submitting', () => {
  beforeEach(async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc());
  });
  const save = (data: Record<string, unknown>, uid = 'studentA') => updateDoc(doc(as(uid), attemptPath('studentA')), data);
  const checkpoint = { answers: { q1: ['a'] }, flags: ['q2'], tabSwitches: 1, lastSavedAt: serverTimestamp() };

  it('lets the student save answers, flags and the tab-switch count with the server time', async () => {
    await assertSucceeds(save(checkpoint));
    await assertSucceeds(save({ ...checkpoint, tabSwitches: 3 }));
  });

  it('refuses a save by anyone else, with a client time, a lower tab-switch count, or too many answers', async () => {
    await assertFails(save(checkpoint, 'studentA2'));
    await assertFails(save(checkpoint, 'teacherA'));
    await assertFails(save({ ...checkpoint, lastSavedAt: minutesFromNow(-1) }));
    await seedDoc(attemptPath('studentA'), attemptDoc({ tabSwitches: 5 }));
    await assertFails(save({ ...checkpoint, tabSwitches: 4 }));
    await assertFails(save({ ...checkpoint, answers: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`q${i}`, ['a']])) }));
  });

  it('refuses a save that changes anything but the answer fields', async () => {
    for (const change of [{ deadlineAt: minutesFromNow(200) }, { startedAt: serverTimestamp() }, { classId: CLASS_B }, { studentId: 'studentA2' }, { extraMinutes: 60 }, { seed: 'another-seed-1234' }, { score: 2 }]) {
      await assertFails(save({ ...checkpoint, ...change }));
    }
  });

  it('lets the student submit with the server time and a student or timeout reason, and not pretend to be expired', async () => {
    await assertFails(save({ ...checkpoint, status: 'submitted', submittedAt: minutesFromNow(-1), submitReason: 'student' }));
    await assertFails(save({ ...checkpoint, status: 'submitted', submittedAt: serverTimestamp(), submitReason: 'expired' }));
    await assertFails(save({ ...checkpoint, status: 'submitted', submittedAt: serverTimestamp() }));
    await assertFails(save({ ...checkpoint, submittedAt: serverTimestamp() }));
    await assertSucceeds(save({ ...checkpoint, status: 'submitted', submittedAt: serverTimestamp(), submitReason: 'student' }));
  });

  it('accepts an automatic submit at time-up', async () => {
    await assertSucceeds(save({ ...checkpoint, status: 'submitted', submittedAt: serverTimestamp(), submitReason: 'timeout' }));
  });

  it('refuses any change once submitted', async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc({ status: 'submitted', submittedAt: minutesFromNow(-1), submitReason: 'student' }));
    await assertFails(save(checkpoint));
    await assertFails(save({ ...checkpoint, status: 'in_progress' }));
  });

  it('allows a save up to 60 seconds after the deadline and refuses later ones', async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-0.5) }));
    await assertSucceeds(save(checkpoint));
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-2) }));
    await assertFails(save(checkpoint));
    await assertFails(save({ ...checkpoint, status: 'submitted', submittedAt: serverTimestamp(), submitReason: 'timeout' }));
  });
});

describe('who can read, change and delete an attempt', () => {
  beforeEach(async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc());
  });
  const read = (uid: string) => getDoc(doc(as(uid), attemptPath('studentA')));

  it('is readable by the student, the exam’s staff, administrators and the spectator', async () => {
    for (const uid of ['studentA', 'teacherA', 'seniorSame', 'admin', 'spectator']) await assertSucceeds(read(uid));
  });

  it('is hidden from other students, parents, other teachers and other institutions', async () => {
    for (const uid of ['studentA2', 'studentB', 'parentA', 'teacherB', 'seniorOther', 'outsiderAdmin']) await assertFails(read(uid));
    await assertFails(getDoc(doc(anonymous(), attemptPath('studentA'))));
  });

  it('lets staff mark an attempt expired only once the deadline and the student’s 60-second grace have passed', async () => {
    const expire = () => updateDoc(doc(as('teacherA'), attemptPath('studentA')), { status: 'submitted', submitReason: 'expired' });
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-0.5) }));
    await assertFails(expire());
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-1.5) }));
    await assertSucceeds(expire());
  });

  it('lets staff mark an attempt expired only after its deadline', async () => {
    const expire = (uid: string) => updateDoc(doc(as(uid), attemptPath('studentA')), { status: 'submitted', submitReason: 'expired' });
    await assertFails(expire('teacherA'));
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-5) }));
    await assertFails(expire('teacherB'));
    await assertFails(expire('spectator'));
    await assertFails(expire('studentA'));
    await assertSucceeds(expire('teacherA'));
  });

  it('lets staff extend an attempt in progress by up to 120 minutes and no more', async () => {
    const extend = (uid: string, minutes: number, extra: number) =>
      updateDoc(doc(as(uid), attemptPath('studentA')), { deadlineAt: minutesFromNow(25 + minutes), extraMinutes: extra });
    await assertFails(extend('teacherB', 10, 10));
    await assertFails(extend('teacherA', 121, 121));
    await assertFails(extend('teacherA', -5, 0));
    await assertSucceeds(extend('teacherA', 10, 10));
    await assertSucceeds(extend('seniorSame', 15, 15));
  });

  it('can be deleted by the exam’s staff, never by the student', async () => {
    await assertFails(deleteDoc(doc(as('studentA'), attemptPath('studentA'))));
    await assertFails(deleteDoc(doc(as('teacherB'), attemptPath('studentA'))));
    await assertFails(deleteDoc(doc(as('spectator'), attemptPath('studentA'))));
    await assertSucceeds(deleteDoc(doc(as('teacherA'), attemptPath('studentA'))));
  });
});
