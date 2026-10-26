import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { doc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  as,
  assertFails,
  assertSucceeds,
  examPath,
  minutesFromNow,
  onlineExam,
  resetAndSeedUsers,
  scheduleExam,
  seed,
  seedExam,
  startEnv,
  stopEnv,
} from './helpers';

// The online exam document (EXAMS_FEATURE_SPEC.md §5.1 and §7): its shape, its status graph and who may change it.

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(resetAndSeedUsers);

const create = (uid: string, over: Record<string, unknown> = {}, id = `new-${uid}`) =>
  setDoc(doc(as(uid), examPath(id)), onlineExam({ teacherId: uid, createdBy: uid, ...over }));
const patch = (uid: string, data: Record<string, unknown>) => updateDoc(doc(as(uid), examPath()), data);

describe('creating an online exam', () => {
  it('lets a teacher create a draft for themselves and an administrator create one for a teacher', async () => {
    await assertSucceeds(create('teacherA'));
    await assertSucceeds(create('seniorSame'));
    await assertSucceeds(setDoc(doc(as('admin'), examPath('by-admin')), onlineExam({ teacherId: 'teacherA', createdBy: 'admin' })));
  });

  it('refuses a teacher creating an exam for another teacher, and anyone else creating one', async () => {
    await assertFails(setDoc(doc(as('teacherB'), examPath('x1')), onlineExam({ teacherId: 'teacherA', createdBy: 'teacherB' })));
    await assertFails(setDoc(doc(as('teacherA'), examPath('x2')), onlineExam({ teacherId: 'teacherA', createdBy: 'teacherB' })));
    for (const uid of ['studentA', 'parentA', 'spectator', 'outsiderAdmin']) await assertFails(create(uid));
  });

  it('must start as a draft at key revision 1, without finalize fields', async () => {
    await assertFails(create('teacherA', { status: 'published' }));
    await assertFails(create('teacherA', { keyRevision: 2 }));
    await assertFails(create('teacherA', { finalizedAt: serverTimestamp() }));
    await assertFails(create('teacherA', { questionStats: {} }));
  });

  it('is limited to Multiple Choice and the known value types and answer modes', async () => {
    for (const categoryType of ['true_false', 'short_answer', 'drag_and_drop', 'mixed', 'nonsense']) {
      await assertFails(create('teacherA', { categoryType }));
    }
    await assertFails(create('teacherA', { valueType: 'homework' }));
    await assertFails(create('teacherA', { answerMode: 'either' }));
  });

  it('needs a title of 1 to 120 characters and a name for the type "Other"', async () => {
    await assertFails(create('teacherA', { title: '' }));
    await assertFails(create('teacherA', { title: 'x'.repeat(121) }));
    await assertSucceeds(create('teacherA', { title: 'x'.repeat(120) }, 'long-title'));
    await assertFails(create('teacherA', { valueType: 'other' }));
    await assertFails(create('teacherA', { valueType: 'other', valueTypeLabel: 'x'.repeat(51) }));
    await assertSucceeds(create('teacherA', { valueType: 'other', valueTypeLabel: 'Spelling bee' }, 'other-ok'));
  });

  it('keeps the duration, window, question count and checkpoint interval in range', async () => {
    for (const duration of [4, 301, 12.5]) await assertFails(create('teacherA', { duration }));
    await assertFails(create('teacherA', { closesAt: minutesFromNow(-60) }));
    await assertFails(create('teacherA', { questionCount: 101 }));
    await assertFails(create('teacherA', { checkpointMinutes: 4 }));
    await assertFails(create('teacherA', { checkpointMinutes: 16 }));
    await assertSucceeds(create('teacherA', { duration: 300, questionCount: 100, checkpointMinutes: 15 }, 'edges'));
  });

  it('may carry the pack count and bytes of its pictures, within range, and nothing malformed', async () => {
    await assertSucceeds(create('teacherA', { imagePacks: 0, imageBytes: 0 }, 'p0'));
    await assertSucceeds(create('teacherA', { imagePacks: 100, imageBytes: 120_000_000 }, 'p1'));
    await assertFails(create('teacherA', { imagePacks: 101 }, 'p2'));
    await assertFails(create('teacherA', { imagePacks: -1 }, 'p3'));
    await assertFails(create('teacherA', { imagePacks: 1.5 }, 'p4'));
    await assertFails(create('teacherA', { imagePacks: '2' }, 'p5'));
    await assertFails(create('teacherA', { imageBytes: 120_000_001 }, 'p6'));
    await assertFails(create('teacherA', { imageBytes: -5 }, 'p7'));
    await assertFails(create('teacherA', { imageBytes: 'big' }, 'p8'));
    await assertSucceeds(create('teacherA', {}, 'p9')); // an exam without pictures has neither
  });

  it('needs a scoring mode unless every question has one answer, and a release time for a scheduled release', async () => {
    await assertFails(create('teacherA', { answerMode: 'both' }));
    await assertSucceeds(create('teacherA', { answerMode: 'both', scoringMode: 'partial' }, 'both-ok'));
    await assertFails(create('teacherA', { scoringMode: 'best' }));
    await assertFails(create('teacherA', { releaseMode: 'scheduled' }));
    await assertSucceeds(create('teacherA', { releaseMode: 'scheduled', releaseAt: minutesFromNow(120) }, 'sched-ok'));
  });

  it('refuses unknown fields and a document whose institutionId disagrees with its path', async () => {
    await assertFails(create('teacherA', { secretNotes: 'x' }));
    await assertFails(create('teacherA', { institutionId: 'inst2' }));
  });
});

describe('the status graph', () => {
  const change = (uid: string, status: string, extra: Record<string, unknown> = {}) => patch(uid, { status, ...extra });
  const finalize = { finalizedAt: serverTimestamp(), questionStats: { q1: { answered: 1, correct: 1 } } };

  it('allows draft to published and refuses draft to closed or finalized', async () => {
    await seedExam({ status: 'draft' });
    await assertFails(change('teacherA', 'closed'));
    await assertFails(change('teacherA', 'finalized', finalize));
    await assertSucceeds(change('teacherA', 'published'));
  });

  it('allows published to closed or back to draft and refuses published to finalized', async () => {
    await seedExam({ status: 'published' });
    await assertFails(change('teacherA', 'finalized', finalize));
    await assertSucceeds(change('teacherA', 'draft'));
    await assertSucceeds(change('teacherA', 'published'));
    await assertSucceeds(change('teacherA', 'closed'));
  });

  it('allows closed to published (reopen) or to finalized with the finalize fields', async () => {
    await seedExam({ status: 'closed' });
    await assertFails(change('teacherA', 'draft'));
    await assertFails(change('teacherA', 'finalized'));
    await assertFails(change('teacherA', 'finalized', { finalizedAt: minutesFromNow(-1), questionStats: {} }));
    await assertFails(change('teacherA', 'finalized', { finalizedAt: serverTimestamp(), questionStats: 'x' }));
    await assertSucceeds(change('teacherA', 'published'));
    await assertSucceeds(change('teacherA', 'closed'));
    await assertSucceeds(change('teacherA', 'finalized', finalize));
  });

  it('never leaves finalized, and a finalized exam may change only its release time', async () => {
    await seedExam({ status: 'finalized', finalizedAt: minutesFromNow(-5), questionStats: {} });
    for (const status of ['draft', 'published', 'closed']) await assertFails(change('admin', status));
    await assertFails(patch('teacherA', { title: 'Renamed' }));
    await assertFails(patch('admin', { title: 'Renamed' }));
    await assertSucceeds(patch('teacherA', { releaseAt: minutesFromNow(30) }));
  });

  it('refuses finalize fields on an exam that is not being finalized', async () => {
    await seedExam({ status: 'published' });
    await assertFails(patch('teacherA', { finalizedAt: serverTimestamp() }));
    await assertFails(patch('teacherA', { questionStats: {} }));
  });
});

describe('who can change an online exam', () => {
  beforeEach(async () => {
    await seedExam({ status: 'draft' });
  });

  it('lets the exam’s teacher, a senior teacher of its department and an administrator edit it', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'admin']) await assertSucceeds(patch(uid, { title: `By ${uid}` }));
  });

  it('refuses another teacher, a senior teacher of another department, students, parents and the spectator', async () => {
    for (const uid of ['teacherB', 'seniorOther', 'studentA', 'parentA', 'spectator']) await assertFails(patch(uid, { title: `By ${uid}` }));
  });

  it('keeps ownership and creation fields fixed, and lets only an administrator reassign the teacher', async () => {
    await assertFails(patch('teacherA', { teacherId: 'teacherB' }));
    await assertFails(patch('teacherA', { departmentId: 'dept2' }));
    await assertFails(patch('admin', { createdBy: 'admin' }));
    await assertFails(patch('admin', { institutionId: 'inst2' }));
    await assertSucceeds(patch('admin', { teacherId: 'teacherB', teacherName: 'Teacher B' }));
  });

  it('never lowers the key revision and never turns an online exam back into a plain one', async () => {
    await seedExam({ status: 'draft', keyRevision: 3 });
    await assertFails(patch('teacherA', { keyRevision: 2 }));
    await assertSucceeds(patch('teacherA', { keyRevision: 4 }));
    await assertFails(patch('teacherA', { online: false }));
  });

  it('still validates the whole document on every edit', async () => {
    await assertFails(patch('teacherA', { duration: 4 }));
    await assertFails(patch('teacherA', { categoryType: 'short_answer' }));
    await assertFails(patch('teacherA', { surprise: true }));
    await assertSucceeds(patch('teacherA', { room: 'Hall' }));
  });
});

describe('turning a plain exam into an online one', () => {
  beforeEach(async () => {
    await seed((db) => setDoc(doc(db, examPath()), scheduleExam()));
  });

  const online = { title: 'Unit 3 Quiz', valueType: 'quiz', categoryType: 'multiple_choice', answerMode: 'single', online: true, opensAt: minutesFromNow(-30), closesAt: minutesFromNow(60), duration: 30, questionCount: 0, totalPoints: 0, autoGrade: false, releaseMode: 'manual', shuffle: true, checkpointMinutes: 10, keyRevision: 1 };

  it('is allowed as a draft and refused as anything else', async () => {
    await assertFails(patch('teacherA', { ...online, status: 'published' }));
    await assertSucceeds(patch('teacherA', { ...online, status: 'draft' }));
  });

  it('is refused when the online fields are incomplete', async () => {
    await assertFails(patch('teacherA', { online: true, status: 'draft' }));
  });
});
