import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, documentId } from 'firebase/firestore';
import {
  KEY,
  QUESTIONS,
  anonymous,
  as,
  assertFails,
  assertSucceeds,
  attemptDoc,
  minutesFromNow,
  resetAndSeedUsers,
  seed,
  seedDoc,
  seedExam,
  startEnv,
  stopEnv,
  subPath,
} from './helpers';

// The pictures of an exam's questions (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §3.2, §10): packs under `content/images_{n}`,
// written by the exam's staff while the questions may still be written, read by staff (who may list `content`) and by a
// student only with their own attempt in progress, never by a parent. The wildcard that governs them must never let a
// pack write reach `content/questions`.

const PACK = (n: number) => subPath(`content/images_${n}`);
const QUESTIONS_PATH = subPath('content/questions');
const CONTENT = (db: ReturnType<typeof as>) => collection(db, subPath('content'));
const image = (fill = 'A') => ({ mime: 'image/png', data: `data:image/png;base64,${fill.repeat(40)}` });
const pack = (over: Record<string, unknown> = {}) => ({ revision: 1, updatedAt: serverTimestamp(), images: { i1: image() }, ...over });
const write = (uid: string, n: number, data: Record<string, unknown>) => setDoc(doc(as(uid), PACK(n)), data);
const read = (uid: string, n: number) => getDoc(doc(as(uid), PACK(n)));
const started = (uid: string, over: Record<string, unknown> = {}) => seedDoc(subPath(`attempts/${uid}`), attemptDoc({ studentId: uid, ...over }));

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seedExam();
  await seedDoc(QUESTIONS_PATH, QUESTIONS);
  await seedDoc(subPath('private/key'), KEY);
  await seedDoc(PACK(1), { revision: 1, updatedAt: minutesFromNow(-5), images: { i1: image() } });
});

describe('writing a pack', () => {
  // Published but not open yet: the questions, and so the pictures, may still be written.
  beforeEach(async () => {
    await seedExam({ opensAt: minutesFromNow(30), closesAt: minutesFromNow(120) });
  });

  it('is allowed for the exam’s teacher, a senior teacher of its department and an administrator, and needs a new revision and the server time', async () => {
    for (const uid of ['teacherA', 'seniorSame', 'admin']) {
      await assertSucceeds(write(uid, 2, pack()));
      await assertSucceeds(write(uid, 1, pack({ revision: 2 })));
    }
  });

  it('is allowed while the exam is a draft or before it opens, and refused once it has opened or is closed', async () => {
    await seedExam({ status: 'draft', opensAt: minutesFromNow(-30), closesAt: minutesFromNow(60) });
    await assertSucceeds(write('teacherA', 3, pack()));
    await seedExam({ status: 'published', opensAt: minutesFromNow(-1), closesAt: minutesFromNow(60) });
    for (const uid of ['teacherA', 'seniorSame', 'admin']) await assertFails(write(uid, 3, pack()));
    await seedExam({ status: 'closed', opensAt: minutesFromNow(-90), closesAt: minutesFromNow(-30) });
    await assertFails(write('admin', 3, pack()));
  });

  it('is refused to another teacher, another department’s senior teacher, students, parents, the spectator and other institutions', async () => {
    for (const uid of ['teacherB', 'seniorOther', 'studentA', 'parentA', 'spectator', 'outsiderAdmin']) await assertFails(write(uid, 2, pack()));
    await assertFails(setDoc(doc(anonymous(), PACK(2)), pack()));
  });

  it('cannot be used to write the questions or any other document of content', async () => {
    await assertFails(setDoc(doc(as('teacherA'), QUESTIONS_PATH), pack()));
    await assertFails(setDoc(doc(as('teacherA'), subPath('content/images_x')), pack()));
    await assertFails(setDoc(doc(as('teacherA'), subPath('content/images_')), pack()));
    await assertFails(setDoc(doc(as('teacherA'), subPath('content/other')), pack()));
  });

  it('needs the server time, a whole revision of 1 or more, one to 100 pictures and no other fields', async () => {
    await assertFails(write('teacherA', 2, pack({ updatedAt: minutesFromNow(-1) })));
    await assertFails(write('teacherA', 2, pack({ revision: 'one' })));
    await assertFails(write('teacherA', 2, pack({ revision: 1.5 })));
    await assertFails(write('teacherA', 2, pack({ revision: 0 })));
    await assertFails(write('teacherA', 2, pack({ images: {} })));
    await assertFails(write('teacherA', 2, pack({ images: 'none' })));
    await assertFails(write('teacherA', 2, pack({ bonus: true })));
    await assertFails(write('teacherA', 2, { revision: 1, images: { i1: image() } }));
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`i${i}`, image()]));
    await assertSucceeds(write('teacherA', 2, pack({ images: many(100) })));
    await assertFails(write('teacherA', 3, pack({ images: many(101) })));
  });

  it('can be deleted by the exam’s staff and not by anyone else', async () => {
    for (const uid of ['studentA', 'parentA', 'teacherB', 'spectator']) await assertFails(deleteDoc(doc(as(uid), PACK(1))));
    await assertSucceeds(deleteDoc(doc(as('teacherA'), PACK(1))));
  });
});

describe('reading a pack', () => {
  it('is allowed to the exam’s staff, any administrator and the spectator at any time, not to other teachers', async () => {
    await seedExam({ status: 'draft', opensAt: minutesFromNow(600), closesAt: minutesFromNow(700) });
    for (const uid of ['teacherA', 'seniorSame', 'admin', 'spectator']) await assertSucceeds(read(uid, 1));
    for (const uid of ['teacherB', 'seniorOther', 'outsiderAdmin']) await assertFails(read(uid, 1));
  });

  it('is allowed to a student of the class only once their attempt exists and is in progress', async () => {
    await assertFails(read('studentA', 1));
    for (const uid of ['studentA', 'studentA2', 'studentBplusA']) await started(uid);
    for (const uid of ['studentA', 'studentA2', 'studentBplusA']) await assertSucceeds(read(uid, 1));
    await started('studentA', { status: 'submitted', submittedAt: minutesFromNow(-1), submitReason: 'student' });
    await assertFails(read('studentA', 1));
    await assertSucceeds(read('studentA2', 1));
  });

  it('is refused to a student of another class, a parent and anyone not signed in, even with an attempt', async () => {
    await started('studentB');
    await assertFails(read('studentB', 1));
    await assertFails(read('parentA', 1));
    await assertFails(getDoc(doc(anonymous(), PACK(1))));
  });

  it('is refused to a student before the window opens, while a draft, and once closed or finalized', async () => {
    await started('studentA');
    await seedExam({ opensAt: minutesFromNow(10), closesAt: minutesFromNow(90) });
    await assertFails(read('studentA', 1));
    for (const status of ['draft', 'closed', 'finalized']) {
      await seedExam({ status });
      await assertFails(read('studentA', 1));
    }
  });

  it('is not readable by id for a student when the id is not a pack: the questions keep their own rule', async () => {
    await started('studentA');
    await assertSucceeds(getDoc(doc(as('studentA'), QUESTIONS_PATH)));
    await assertFails(getDoc(doc(as('studentA'), subPath('content/other'))));
  });
});

describe('listing content', () => {
  it('is allowed to staff, who then see the questions and every pack', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, PACK(2)), { revision: 1, updatedAt: minutesFromNow(-5), images: { i2: image('B') } });
    });
    for (const uid of ['teacherA', 'seniorSame', 'admin', 'spectator']) {
      const all = await assertSucceeds(getDocs(CONTENT(as(uid))));
      if (all.size !== 3) throw new Error(`${uid} saw ${all.size} documents, not 3`);
      const packs = await assertSucceeds(getDocs(query(CONTENT(as(uid)), where(documentId(), '>=', 'images_'), where(documentId(), '<', 'images`'))));
      if (packs.size !== 2) throw new Error(`${uid} saw ${packs.size} packs, not 2`);
    }
  });

  it('is refused to another teacher, a parent and a student, with an attempt or not', async () => {
    await started('studentA');
    for (const uid of ['teacherB', 'seniorOther', 'parentA', 'studentA', 'outsiderAdmin']) await assertFails(getDocs(CONTENT(as(uid))));
    await assertFails(getDocs(query(CONTENT(as('studentA')), where(documentId(), '>=', 'images_'), where(documentId(), '<', 'images`'))));
    await assertFails(getDocs(CONTENT(anonymous())));
  });
});
