import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { Timestamp, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  EXAM,
  INST,
  as,
  assertFails,
  assertSucceeds,
  attemptDoc,
  fresh,
  gradeDoc,
  minutesFromNow,
  resetAndSeedUsers,
  seedDoc,
  seedExam,
  startEnv,
  stopEnv,
  subPath,
} from './helpers';
import { autoGradeFields, manualGradeFields, resultFieldsFor, type AttemptForGrading, type ExistingGrade } from '../src/lib/examGradingLogic';
import { extraTimePlan } from '../src/lib/examExtraTime';
import type { ExamQuestion } from '../src/types/exams';

// Grading as the app really writes it. These build the grades, the results entries and the extra-time writes with the
// same functions the results screen uses (src/lib/examGradingLogic.ts, examExtraTime.ts) and send them to the real
// rules, so the screen and the rules cannot drift apart without a test failing. The exam (helpers.ts) belongs to
// teacherA, department dept1, class A, subject subj1.

const MIN = 60_000;
const markers = () => ({ serverTime: serverTimestamp(), timestampOf: (ms: number) => Timestamp.fromMillis(ms) });
const gradePath = (uid: string) => subPath(`grades/${uid}`);
const attemptPath = (uid: string) => subPath(`attempts/${uid}`);
const resultPath = (uid: string) => `institutions/${INST}/results/exam_${EXAM}_${uid}`;

const questions: ExamQuestion[] = [
  { id: 'q1', text: 'One', kind: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], points: 1 },
  { id: 'q2', text: 'Two', kind: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], points: 1 },
];
const key = { q1: ['a'], q2: ['b'] };

const attempt = (over: Partial<AttemptForGrading> = {}): AttemptForGrading => ({
  studentId: 'studentA',
  studentName: 'Student A',
  classId: 'classA',
  status: 'submitted',
  deadlineAtMs: Date.now() - 20 * MIN,
  answers: { q1: ['a'], q2: ['b'] },
  tabSwitches: 3,
  submittedAtMs: Date.now() - 25 * MIN,
  submitReason: 'student',
  ...over,
});
const examFor = (releaseMode: 'auto' | 'scheduled' | 'manual', releaseAtMs: number | null = null) => ({
  releaseMode,
  releaseAtMs,
  scoringMode: 'all_or_nothing' as const,
  keyRevision: 1,
});
const grade = (uid: string, releaseMode: 'auto' | 'scheduled' | 'manual' = 'manual', over: Partial<AttemptForGrading> = {}) =>
  autoGradeFields({
    institutionId: INST,
    attempt: attempt(over),
    questions,
    key,
    exam: examFor(releaseMode),
    grader: { uid, name: uid },
    nowMs: Date.now(),
    markers: markers(),
  });
const resultFor = (uid: string, grader: string, update = false) =>
  resultFieldsFor({
    exam: {
      id: EXAM,
      institutionId: INST,
      termId: 'term1',
      subjectId: 'subj1',
      classId: 'classA',
      className: 'Class A',
      departmentId: 'dept1',
      title: 'Unit 3 Quiz',
      subjectName: 'Maths',
      date: '2026-11-02',
    },
    student: { studentId: uid, studentName: 'Student A' },
    score: 2,
    maxScore: 2,
    grader: { uid: grader, name: grader },
    update,
    serverTime: serverTimestamp(),
  });
const writeGrade = (writer: string, uid: string, fields: Record<string, unknown>) => setDoc(doc(as(writer), gradePath(uid)), fields);
const writeResult = (writer: string, uid: string, fields: Record<string, unknown>) => setDoc(doc(as(writer), resultPath(uid)), fields);

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seedExam({ status: 'closed', opensAt: minutesFromNow(-90), closesAt: minutesFromNow(-30) });
  await seedDoc(`institutions/${INST}/subjects/subj1`, { name: 'Maths', teacherIds: ['teacherA'], institutionId: INST });
});

describe('an automatic grade', () => {
  it('is accepted from the exam’s teacher, a senior teacher of the department and an administrator', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'admin']) await assertSucceeds(writeGrade(uid, 'studentA', grade(uid).fields));
  });

  it('is refused from another teacher, a student, a parent and the spectator', async () => {
    for (const uid of ['teacherB', 'seniorOther', 'studentA', 'parentA', 'spectator']) await assertFails(writeGrade(uid, 'studentA', grade(uid).fields));
  });

  it('carries the attempt’s tab count, submit time and reason, and is hidden until released', async () => {
    await assertSucceeds(writeGrade('teacherA', 'studentA', grade('teacherA').fields));
    await assertFails(getDoc(doc(as('studentA'), gradePath('studentA'))));
    await assertFails(getDoc(doc(as('parentA'), gradePath('studentA'))));
    await assertSucceeds(getDoc(doc(as('teacherA'), gradePath('studentA'))));
  });

  it('is readable by the student and the parent at once when the exam releases as soon as graded', async () => {
    await assertSucceeds(writeGrade('teacherA', 'studentA', grade('teacherA', 'auto').fields));
    // A client opened after the write: the emulator takes request.time from when a client connected (see fresh()).
    await assertSucceeds(getDoc(doc(fresh('studentA'), gradePath('studentA'))));
    await assertSucceeds(getDoc(doc(fresh('parentA'), gradePath('studentA'))));
  });

  it('is accepted for an attempt that expired, which has no submit time', async () => {
    const expired = grade('teacherA', 'manual', { submittedAtMs: null, submitReason: 'expired' });
    await assertSucceeds(writeGrade('teacherA', 'studentA', expired.fields));
  });

  it('is accepted for a scheduled release time in the future and keeps the score hidden', async () => {
    const scheduled = autoGradeFields({
      institutionId: INST,
      attempt: attempt(),
      questions,
      key,
      exam: examFor('scheduled', Date.now() + 60 * MIN),
      grader: { uid: 'teacherA', name: 'teacherA' },
      nowMs: Date.now(),
      markers: markers(),
    });
    await assertSucceeds(writeGrade('teacherA', 'studentA', scheduled.fields));
    await assertFails(getDoc(doc(as('studentA'), gradePath('studentA'))));
  });
});

describe('a score entered or overridden by staff', () => {
  const manual = (uid: string, over: Partial<Parameters<typeof manualGradeFields>[0]> = {}) => {
    const out = manualGradeFields({
      institutionId: INST,
      student: { studentId: 'studentA2', studentName: 'Student A2', classId: 'classA' },
      score: 1.5,
      maxScore: 2,
      exam: examFor('manual'),
      grader: { uid, name: uid },
      nowMs: Date.now(),
      markers: markers(),
      ...over,
    });
    if (!out.ok) throw new Error(out.error);
    return out.fields;
  };

  it('is accepted for a student who never started, with no attempt fields', async () => {
    await assertSucceeds(writeGrade('teacherA', 'studentA2', manual('teacherA', { comment: 'Sat on paper' })));
  });

  it('is accepted as an override, keeping the tab count and submit time, with a reason', async () => {
    await seedDoc(gradePath('studentA'), gradeDoc({ method: 'auto' }));
    const existing: ExistingGrade = { studentId: 'studentA', method: 'auto', keyRevision: 1, releaseAtMs: Date.now() - 10 * MIN, resultSynced: false, tabSwitches: 2, submittedAtMs: Date.now() - 30 * MIN, submitReason: 'student' };
    const fields = manual('teacherA', {
      student: { studentId: 'studentA', studentName: 'Student A', classId: 'classA' },
      existing,
      reason: 'The key was wrong for question 2',
    });
    await assertSucceeds(writeGrade('teacherA', 'studentA', fields));
  });
});

describe('the results entry', () => {
  it('is created by the exam’s teacher, who is in the subject’s teachers', async () => {
    await assertSucceeds(writeResult('teacherA', 'studentA', resultFor('studentA', 'teacherA').fields));
  });

  it('is created by an administrator and by a senior teacher of the department', async () => {
    await assertSucceeds(writeResult('admin', 'studentA', resultFor('studentA', 'admin').fields));
    await assertSucceeds(writeResult('seniorSame', 'studentA2', resultFor('studentA2', 'seniorSame').fields));
  });

  it('is refused from a teacher who is not one of the subject’s teachers, and writing as someone else', async () => {
    await assertFails(writeResult('teacherB', 'studentA', resultFor('studentA', 'teacherB').fields));
    await assertFails(writeResult('teacherA', 'studentA', resultFor('studentA', 'teacherB').fields));
  });

  it('is readable by the student, their parent and the staff', async () => {
    await assertSucceeds(writeResult('teacherA', 'studentA', resultFor('studentA', 'teacherA').fields));
    for (const uid of ['studentA', 'parentA', 'teacherA', 'admin']) await assertSucceeds(getDoc(doc(as(uid), resultPath('studentA'))));
    for (const uid of ['studentA2', 'parentB']) await assertFails(getDoc(doc(as(uid), resultPath('studentA'))));
  });

  it('is updated in place by the teacher who wrote it, and by an administrator', async () => {
    await assertSucceeds(writeResult('teacherA', 'studentA', resultFor('studentA', 'teacherA').fields));
    await assertSucceeds(updateDoc(doc(as('teacherA'), resultPath('studentA')), { ...resultFor('studentA', 'teacherA', true).fields, score: 1 }));
    await assertSucceeds(updateDoc(doc(as('admin'), resultPath('studentA')), { ...resultFor('studentA', 'admin', true).fields, score: 2 }));
  });

  it('cannot be updated by the exam’s regular teacher once an administrator wrote it (the entry names its writer)', async () => {
    await assertSucceeds(writeResult('admin', 'studentA', resultFor('studentA', 'admin').fields));
    await assertFails(updateDoc(doc(as('teacherA'), resultPath('studentA')), resultFor('studentA', 'teacherA', true).fields));
    await assertSucceeds(updateDoc(doc(as('seniorSame'), resultPath('studentA')), resultFor('studentA', 'seniorSame', true).fields));
  });
});

describe('releasing and copying scores', () => {
  beforeEach(async () => {
    await seedDoc(gradePath('studentA'), gradeDoc({ releaseAt: null }));
  });

  it('lets staff release with the server time and mark the entry copied in one write', async () => {
    await assertSucceeds(updateDoc(doc(as('teacherA'), gradePath('studentA')), { releaseAt: serverTimestamp(), resultSynced: true }));
    await assertSucceeds(getDoc(doc(fresh('studentA'), gradePath('studentA'))));
  });

  it('lets staff mark an already released score as copied', async () => {
    await seedDoc(gradePath('studentA'), gradeDoc({ releaseAt: minutesFromNow(-5), resultSynced: false }));
    await assertSucceeds(updateDoc(doc(as('admin'), gradePath('studentA')), { resultSynced: true }));
  });

  it('refuses a student, a parent and the spectator', async () => {
    for (const uid of ['studentA', 'parentA', 'spectator']) await assertFails(updateDoc(doc(as(uid), gradePath('studentA')), { releaseAt: serverTimestamp(), resultSynced: true }));
  });
});

describe('marking an unfinished attempt as expired', () => {
  const expire = (uid: string) => updateDoc(doc(as(uid), attemptPath('studentA')), { status: 'submitted', submitReason: 'expired' });

  it('is allowed for the exam’s staff once the deadline has passed', async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-5) }));
    await assertSucceeds(expire('teacherA'));
  });

  it('is refused before the deadline, and to anyone but the exam’s staff', async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(5) }));
    await assertFails(expire('teacherA'));
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: minutesFromNow(-5) }));
    for (const uid of ['teacherB', 'studentA', 'spectator']) await assertFails(expire(uid));
  });
});

describe('extra time', () => {
  const extra = (uid: string, minutes: number) =>
    setDoc(doc(as(uid), subPath('accommodations/studentA')), { extraMinutes: minutes, addedBy: uid, addedAt: serverTimestamp() });

  it('is recorded by the exam’s staff, 1 to 120 minutes, and not by a student or the spectator', async () => {
    await assertSucceeds(extra('teacherA', 15));
    await assertFails(extra('teacherA', 121));
    for (const uid of ['studentA', 'parentA', 'spectator', 'teacherB']) await assertFails(extra(uid, 15));
  });

  it('lengthens a running attempt by the plan the app makes', async () => {
    const deadline = Date.now() + 20 * MIN;
    await seedDoc(attemptPath('studentA'), attemptDoc({ deadlineAt: Timestamp.fromMillis(deadline), extraMinutes: 0 }));
    const plan = extraTimePlan({ extraMinutes: 15, attempt: { status: 'in_progress', deadlineAtMs: deadline, extraMinutes: 0 } });
    if (!plan.ok || !plan.attempt) throw new Error('no plan');
    await assertSucceeds(
      updateDoc(doc(as('teacherA'), attemptPath('studentA')), { deadlineAt: Timestamp.fromMillis(plan.attempt.deadlineAtMs), extraMinutes: plan.attempt.extraMinutes }),
    );
    // Not by the student, and not past 120 minutes more.
    await assertFails(updateDoc(doc(as('studentA'), attemptPath('studentA')), { deadlineAt: Timestamp.fromMillis(deadline + 40 * MIN), extraMinutes: 15 }));
    await assertFails(
      updateDoc(doc(as('teacherA'), attemptPath('studentA')), { deadlineAt: Timestamp.fromMillis(plan.attempt.deadlineAtMs + 130 * MIN), extraMinutes: 15 }),
    );
  });
});

describe('Finalize', () => {
  const stats = { q1: { answered: 2, correct: 1 }, q2: { answered: 2, correct: 2 } };
  const finalize = (uid: string, over: Record<string, unknown> = {}) =>
    updateDoc(doc(as(uid), `institutions/${INST}/exams/${EXAM}`), { status: 'finalized', finalizedAt: serverTimestamp(), questionStats: stats, ...over });
  const finalizeWithoutCounts = (uid: string) =>
    updateDoc(doc(as(uid), `institutions/${INST}/exams/${EXAM}`), { status: 'finalized', finalizedAt: serverTimestamp() });

  it('is allowed for the exam’s staff on a closed exam, with the server time and the counts', async () => {
    await assertSucceeds(finalize('teacherA'));
  });

  it('is refused from a published exam (it is closed first), without the counts, or with a client time', async () => {
    await seedExam({ status: 'published', opensAt: minutesFromNow(-90), closesAt: minutesFromNow(-30) });
    await assertFails(finalize('teacherA'));
    await seedExam({ status: 'closed', opensAt: minutesFromNow(-90), closesAt: minutesFromNow(-30) });
    await assertFails(finalizeWithoutCounts('teacherA'));
    await assertFails(finalize('teacherA', { finalizedAt: minutesFromNow(-1) }));
    await assertFails(finalize('teacherB'));
    await assertFails(finalize('spectator'));
  });

  it('closes a published exam first, then finalizes it, as the app does', async () => {
    await seedExam({ status: 'published', opensAt: minutesFromNow(-90), closesAt: minutesFromNow(-30) });
    await assertSucceeds(updateDoc(doc(as('teacherA'), `institutions/${INST}/exams/${EXAM}`), { status: 'closed' }));
    await assertSucceeds(finalize('teacherA'));
  });

  it('lets staff delete the attempts of a finalized exam, and not a student', async () => {
    await seedDoc(attemptPath('studentA'), attemptDoc({ status: 'submitted', submittedAt: minutesFromNow(-40), submitReason: 'student' }));
    await assertSucceeds(finalize('teacherA'));
    await assertFails(deleteDoc(doc(as('studentA'), attemptPath('studentA'))));
    await assertSucceeds(deleteDoc(doc(as('teacherA'), attemptPath('studentA'))));
  });
});
