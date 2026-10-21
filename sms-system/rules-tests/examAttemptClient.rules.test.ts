import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { Timestamp, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  INST,
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
import { checkpointFields, newAttemptFields, submitFields } from '../src/lib/examAttemptLogic';
import { startDeadlineMs } from '../src/lib/examClock';
import { makeAttemptOrder } from '../src/lib/examShuffle';
import type { ExamQuestion } from '../src/types/exams';

// The attempt as the app really writes it. These build the documents with the same functions the attempt screen uses
// (src/lib/examAttemptLogic.ts, examClock.ts) and send them to the real rules, so the client and the rules cannot
// drift apart without a test failing. The exam (helpers.ts) opened 30 minutes ago, closes in 60 and lasts 30 minutes.

const MIN = 60_000;
const questions: ExamQuestion[] = [
  { id: 'q1', text: 'One', kind: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], points: 1 },
  { id: 'q2', text: 'Two', kind: 'multiple', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], points: 1 },
];
const attemptPath = (uid: string) => subPath(`attempts/${uid}`);

/** What the app writes to start: the server's time (an offset), a deadline from startDeadlineMs. */
function startWith(opts: { offsetMs: number | null; deviceAheadMs?: number; extraMinutes?: number; closesInMin?: number; uid?: string }) {
  const clientNowMs = Date.now() + (opts.deviceAheadMs ?? 0);
  const deadlineMs = startDeadlineMs({
    clientNowMs,
    offsetMs: opts.offsetMs,
    durationMinutes: 30,
    extraMinutes: opts.extraMinutes,
    closesAtMs: Date.now() + (opts.closesInMin ?? 60) * MIN,
  });
  const uid = opts.uid ?? 'studentA';
  return newAttemptFields({
    institutionId: INST,
    uid,
    studentName: 'Student A',
    classId: 'classA',
    startedAt: serverTimestamp(),
    deadlineAt: Timestamp.fromMillis(deadlineMs),
    lastSavedAt: serverTimestamp(),
    extraMinutes: opts.extraMinutes ?? 0,
    order: makeAttemptOrder(questions, true),
  });
}
const begin = (uid: string, data: Record<string, unknown>) => setDoc(doc(as(uid), attemptPath(uid)), data);

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seedExam();
});

describe('starting, with the deadline the app computes', () => {
  it('is accepted with the server’s time known, whatever the device clock says', async () => {
    await assertSucceeds(begin('studentA', startWith({ offsetMs: 0 })));
    // A device 10 minutes ahead: the offset corrects it.
    await assertSucceeds(begin('studentA2', startWith({ offsetMs: -10 * MIN, deviceAheadMs: 10 * MIN, uid: 'studentA2' })));
  });

  it('is accepted with the server’s time unknown while the device clock is right (the wide margin covers a small error)', async () => {
    await assertSucceeds(begin('studentA', startWith({ offsetMs: null })));
  });

  it('would be refused by the rules with an unknown clock that is 10 minutes ahead, which is why the offset is read', async () => {
    await assertFails(begin('studentA', startWith({ offsetMs: null, deviceAheadMs: 10 * MIN })));
  });

  it('is accepted for a late start, with the deadline cut to the close of the window', async () => {
    await seedExam({ closesAt: minutesFromNow(12) });
    await assertSucceeds(begin('studentA', startWith({ offsetMs: 0, closesInMin: 12 })));
  });

  it('is accepted with extra time, and the deadline carries it', async () => {
    await seedDoc(subPath('accommodations/studentA'), { extraMinutes: 15, addedBy: 'teacherA', addedAt: minutesFromNow(-60) });
    await assertSucceeds(begin('studentA', startWith({ offsetMs: 0, extraMinutes: 15 })));
  });

  it('is accepted for a student in an additional class', async () => {
    await assertSucceeds(begin('studentBplusA', startWith({ offsetMs: 0, uid: 'studentBplusA' })));
  });
});

describe('saving and submitting, with the fields the app writes', () => {
  beforeEach(async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(20) }));
  });
  const write = (data: Record<string, unknown>) => updateDoc(doc(as('studentA'), attemptPath('studentA')), data);
  const state = { questions, answers: { q1: ['a'], q2: ['b', 'c'] }, flags: ['q2'], tabSwitches: 2 };

  it('accepts a checkpoint', async () => {
    await assertSucceeds(write(checkpointFields({ ...state, lastSavedAt: serverTimestamp() })));
    await assertSucceeds(write(checkpointFields({ ...state, tabSwitches: 3, lastSavedAt: serverTimestamp() })));
  });

  it('accepts a submit by the student and an automatic one at time-up', async () => {
    await assertSucceeds(write(submitFields({ ...state, serverTime: serverTimestamp(), reason: 'student' })));
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(20) }));
    await assertSucceeds(write(submitFields({ ...state, serverTime: serverTimestamp(), reason: 'timeout' })));
  });

  it('stores what was written', async () => {
    await assertSucceeds(write(submitFields({ ...state, serverTime: serverTimestamp(), reason: 'student' })));
    const saved = (await getDoc(doc(as('studentA'), attemptPath('studentA')))).data();
    if (saved?.status !== 'submitted' || saved.answers.q2.length !== 2 || saved.tabSwitches !== 2) throw new Error('not stored as written');
  });

  it('accepts a submit within the 60 seconds after the deadline, and refuses it later', async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-0.5) }));
    await assertSucceeds(write(submitFields({ ...state, serverTime: serverTimestamp(), reason: 'timeout' })));
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-2) }));
    await assertFails(write(submitFields({ ...state, serverTime: serverTimestamp(), reason: 'timeout' })));
  });
});
