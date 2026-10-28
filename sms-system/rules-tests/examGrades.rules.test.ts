import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import {
  INST,
  anonymous,
  as,
  assertFails,
  assertSucceeds,
  gradeDoc,
  minutesFromNow,
  resetAndSeedUsers,
  seedDoc,
  seedExam,
  startEnv,
  stopEnv,
  subPath,
} from './helpers';

// A score (EXAMS_FEATURE_SPEC.md §5.5, §6.7, §7): hidden from the student and the parent until releaseAt, read by id,
// written by the exam's staff only.

const gradePath = (uid: string) => subPath(`grades/${uid}`);
const read = (uid: string, studentUid = 'studentA') => getDoc(doc(as(uid), gradePath(studentUid)));

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seedExam({ status: 'closed' });
  await seedDoc(gradePath('studentA'), gradeDoc());
});

describe('reading a released score', () => {
  it('lets the student and their linked parent read it', async () => {
    await assertSucceeds(read('studentA'));
    await assertSucceeds(read('parentA'));
  });

  it('refuses another student, a parent of another child, other institutions and anyone not signed in', async () => {
    for (const uid of ['studentA2', 'studentB', 'studentBplusA', 'parentB', 'outsiderAdmin']) await assertFails(read(uid));
    await assertFails(getDoc(doc(anonymous(), gradePath('studentA'))));
  });

  it('lets the exam’s staff, administrators and the spectator read it', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'admin', 'spectator']) await assertSucceeds(read(uid));
  });

  it('refuses other teachers, who have no part in this exam', async () => {
    for (const uid of ['teacherB', 'seniorOther']) await assertFails(read(uid));
  });
});

describe('a score that is not released yet', () => {
  it('is hidden from the student and the parent while releaseAt is in the future', async () => {
    await seedDoc(gradePath('studentA'), gradeDoc({ releaseAt: minutesFromNow(30) }));
    await assertFails(read('studentA'));
    await assertFails(read('parentA'));
  });

  it('is hidden while releaseAt is null (waiting for the teacher to press Release)', async () => {
    await seedDoc(gradePath('studentA'), gradeDoc({ releaseAt: null }));
    await assertFails(read('studentA'));
    await assertFails(read('parentA'));
  });

  it('is still readable by the exam’s staff and the spectator', async () => {
    await seedDoc(gradePath('studentA'), gradeDoc({ releaseAt: null }));
    for (const uid of ['teacherA', 'seniorSame', 'admin', 'spectator']) await assertSucceeds(read(uid));
  });

  it('cannot be found by a student’s query, because a query cannot prove the release time', async () => {
    const mine = query(collection(as('studentA'), subPath('grades')), where('studentId', '==', 'studentA'));
    await assertFails(getDocs(mine));
  });
});

describe('writing a score', () => {
  const grade = (uid: string, studentUid: string, over: Record<string, unknown> = {}) =>
    gradeDoc({ studentId: studentUid, gradedBy: uid, gradedByName: uid, gradedAt: serverTimestamp(), ...over });
  const write = (uid: string, studentUid = 'studentA2', over: Record<string, unknown> = {}) =>
    setDoc(doc(as(uid), gradePath(studentUid)), grade(uid, studentUid, over));

  it('lets the exam’s teacher, a senior teacher of its department and an administrator grade a student', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'admin']) await assertSucceeds(write(uid));
  });

  it('refuses other teachers, students, parents and the spectator', async () => {
    for (const uid of ['teacherB', 'seniorOther', 'studentA', 'parentA', 'spectator']) await assertFails(write(uid));
  });

  it('needs the grader to be the writer, the server time, and a score from 0 to the maximum', async () => {
    await assertFails(write('teacherA', 'studentA2', { gradedBy: 'teacherB' }));
    await assertFails(write('teacherA', 'studentA2', { gradedAt: minutesFromNow(-1) }));
    await assertFails(write('teacherA', 'studentA2', { score: 3, maxScore: 2 }));
    await assertFails(write('teacherA', 'studentA2', { score: -1 }));
    await assertSucceeds(write('teacherA', 'studentA2', { score: 2, maxScore: 2 }));
  });

  it('needs the document to be about the student in its path, in this institution, with no unknown fields', async () => {
    await assertFails(setDoc(doc(as('teacherA'), gradePath('studentA2')), grade('teacherA', 'studentB')));
    await assertFails(write('teacherA', 'studentA2', { institutionId: 'inst2' }));
    await assertFails(write('teacherA', 'studentA2', { bonus: 5 }));
    await assertFails(write('teacherA', 'studentA2', { method: 'guess' }));
    await assertFails(write('teacherA', 'studentA2', { releaseAt: 'later' }));
    await assertSucceeds(write('teacherA', 'studentA2', { releaseAt: null }));
  });

  it('may carry the attempt’s tab count, submit time and reason, and short notes, and nothing malformed', async () => {
    await assertSucceeds(write('teacherA', 'studentA2', { tabSwitches: 3, submittedAt: minutesFromNow(-40), submitReason: 'timeout' }));
    await assertSucceeds(write('teacherA', 'studentA2', { method: 'manual', manualReason: 'x'.repeat(200), comment: 'y'.repeat(500) }));
    await assertFails(write('teacherA', 'studentA2', { tabSwitches: -1 }));
    await assertFails(write('teacherA', 'studentA2', { tabSwitches: 1.5 }));
    await assertFails(write('teacherA', 'studentA2', { tabSwitches: '2' }));
    await assertFails(write('teacherA', 'studentA2', { submittedAt: 'yesterday' }));
    await assertFails(write('teacherA', 'studentA2', { submitReason: 'cheated' }));
    await assertFails(write('teacherA', 'studentA2', { manualReason: 'x'.repeat(201) }));
    await assertFails(write('teacherA', 'studentA2', { comment: 'y'.repeat(501) }));
    await assertFails(write('teacherA', 'studentA2', { comment: 42 }));
  });

  it('may carry the activity summary with at most 50 timeline entries, and nothing malformed', async () => {
    const summary = {
      leaves: 4,
      hiddenLeaves: 3,
      awaySeconds: 212,
      longestAwaySeconds: 120,
      acts: 1,
      review: true,
      timeline: Array.from({ length: 50 }, (_, i) => ({ t: i, k: 'hidden', d: 2 })),
    };
    await assertSucceeds(write('teacherA', 'studentA2', { integrity: summary }));
    await assertSucceeds(write('teacherA', 'studentA2', { integrity: { ...summary, fastAnswers: 3, timeline: [] } }));
    await assertFails(write('teacherA', 'studentA2', { integrity: { ...summary, timeline: Array.from({ length: 51 }, (_, i) => ({ t: i, k: 'hidden' })) } }));
    await assertFails(write('teacherA', 'studentA2', { integrity: { ...summary, verdict: 'cheated' } }));
    const withoutReview: Record<string, unknown> = { ...summary };
    delete withoutReview.review;
    await assertFails(write('teacherA', 'studentA2', { integrity: withoutReview }));
    await assertFails(write('teacherA', 'studentA2', { integrity: { leaves: 1 } }));
    await assertFails(write('teacherA', 'studentA2', { integrity: { ...summary, leaves: -1 } }));
    await assertFails(write('teacherA', 'studentA2', { integrity: { ...summary, awaySeconds: 1.5 } }));
    await assertFails(write('teacherA', 'studentA2', { integrity: { ...summary, review: 'yes' } }));
    await assertFails(write('teacherA', 'studentA2', { integrity: { ...summary, timeline: 'none' } }));
    await assertFails(write('teacherA', 'studentA2', { integrity: 'fine' }));
  });

  it('lets staff release a score or mark it copied to the results, and nothing else without a full grading write', async () => {
    await assertSucceeds(updateDoc(doc(as('teacherA'), gradePath('studentA')), { releaseAt: minutesFromNow(-1) }));
    await assertSucceeds(updateDoc(doc(as('teacherA'), gradePath('studentA')), { resultSynced: true }));
    await assertFails(updateDoc(doc(as('teacherA'), gradePath('studentA')), { score: 2 }));
    await assertFails(updateDoc(doc(as('studentA'), gradePath('studentA')), { releaseAt: minutesFromNow(-1) }));
    await assertFails(updateDoc(doc(as('teacherB'), gradePath('studentA')), { releaseAt: minutesFromNow(-1) }));
  });

  it('lets staff delete a score and refuses the student', async () => {
    await assertFails(deleteDoc(doc(as('studentA'), gradePath('studentA'))));
    await assertFails(deleteDoc(doc(as('spectator'), gradePath('studentA'))));
    await assertSucceeds(deleteDoc(doc(as('teacherA'), gradePath('studentA'))));
  });
});

describe('the same institution is required', () => {
  it('refuses a score written for an institution other than the path’s', async () => {
    await assertFails(setDoc(doc(as('outsiderAdmin'), gradePath('studentA2')), gradeDoc({ studentId: 'studentA2', institutionId: INST, gradedBy: 'outsiderAdmin', gradedAt: serverTimestamp() })));
  });
});
