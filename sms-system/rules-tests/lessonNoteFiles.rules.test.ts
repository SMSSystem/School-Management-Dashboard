import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import {
  CLASS_A,
  CLASS_B,
  DEPT,
  INST,
  anonymous,
  as,
  assertFails,
  assertSucceeds,
  resetAndSeedUsers,
  seed,
  seedDoc,
  startEnv,
  stopEnv,
} from './helpers';

// Who can read a lesson note's files (LESSON_NOTE_12_FILES_SPEC.md section 10). A file document holds the file or the
// key to it, so a student may read only those of their own classes. The note's details stay broad, because a rule
// cannot be proven for a query on a note's classIds list (ISSUES_AND_GAPS.md #66). A parent may read those of the
// classes on their stored list, linkedClassIds (src/lib/parentLinkedClasses.ts).

const CLASS_C = 'classC';

const notePath = (id: string) => `institutions/${INST}/lessonNotes/${id}`;
const filePath = (id: string) => `${notePath(id)}/attachment/file1`;

function note(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    institutionId: INST,
    name: 'Fractions',
    teacherId: 'teacherA',
    teacherName: 'Teacher A',
    teacherRole: 'regular_teacher',
    departmentId: DEPT,
    hasAttachment: true,
    attachmentIds: ['file1'],
    ...over,
  };
}

const NOTES: Record<string, Record<string, unknown>> = {
  // As the form writes them: classId is the first of classIds.
  forA: note({ classId: CLASS_A, className: 'A', classIds: [CLASS_A], classNames: ['A'] }),
  forBthenA: note({ classId: CLASS_B, className: 'B', classIds: [CLASS_B, CLASS_A], classNames: ['B', 'A'] }),
  // From before a note could have several classes.
  olderForA: note({ classId: CLASS_A, className: 'A' }),
  noClass: note(),
};

const readFile = (uid: string, noteId: string) => getDoc(doc(as(uid), filePath(noteId)));

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seed(async (db) => {
    for (const [id, data] of Object.entries(NOTES)) {
      await setDoc(doc(db, notePath(id)), data);
      await setDoc(doc(db, filePath(id)), { fileName: 'a.pdf', mimeType: 'application/pdf', size: 10, dataUrl: 'data:application/pdf;base64,AA==' });
    }
  });
});

describe('a student reading one file', () => {
  it('allows a file of their class', async () => {
    await assertSucceeds(readFile('studentA', 'forA'));
  });

  it('refuses a file of another class', async () => {
    await assertFails(readFile('studentB', 'forA'));
  });

  it('allows any class of a note for several, not only the first', async () => {
    await assertSucceeds(readFile('studentA', 'forBthenA'));
    await assertSucceeds(readFile('studentB', 'forBthenA'));
  });

  it('reads a note from before several classes by its classId', async () => {
    await assertSucceeds(readFile('studentA', 'olderForA'));
    await assertFails(readFile('studentB', 'olderForA'));
  });

  it('counts an additional class', async () => {
    await assertSucceeds(readFile('studentBplusA', 'forA'));
  });

  it('allows a student who has only a classId', async () => {
    await seedDoc('users/onlyHome', { role: 'student', institutionId: INST, status: 'active', classId: CLASS_A });
    await assertSucceeds(readFile('onlyHome', 'forA'));
    await assertSucceeds(readFile('onlyHome', 'forBthenA'));
    await assertFails(readFile('onlyHome', 'noClass'));
  });

  it('counts the home class when their classIds leaves it out, as the screens do', async () => {
    await seedDoc('users/homeMissing', { role: 'student', institutionId: INST, status: 'active', classId: CLASS_A, classIds: [CLASS_C] });
    await assertSucceeds(readFile('homeMissing', 'forA'));
  });

  it('allows a student who has only classIds', async () => {
    await seedDoc('users/onlyList', { role: 'student', institutionId: INST, status: 'active', classIds: [CLASS_A] });
    await assertSucceeds(readFile('onlyList', 'forA'));
    await assertFails(readFile('onlyList', 'noClass'));
  });

  it('refuses a student who has no class', async () => {
    await seedDoc('users/noClasses', { role: 'student', institutionId: INST, status: 'active' });
    await assertFails(readFile('noClasses', 'forA'));
  });

  it('refuses a file of a note with no class', async () => {
    await assertFails(readFile('studentA', 'noClass'));
  });

  it('still lets the student read the note itself, as the query needs', async () => {
    await assertSucceeds(getDoc(doc(as('studentB'), notePath('forA'))));
  });
});

describe('everyone else reading one file', () => {
  it('leaves administrators and spectators able to read any file', async () => {
    for (const uid of ['admin', 'spectator']) {
      for (const id of Object.keys(NOTES)) await assertSucceeds(readFile(uid, id));
    }
  });

  it('lets the author and a senior teacher of the department read, and no other teacher', async () => {
    await assertSucceeds(readFile('teacherA', 'noClass'));
    await assertSucceeds(readFile('seniorSame', 'forA'));
    await assertFails(readFile('teacherB', 'forA'));
    await assertFails(readFile('seniorOther', 'forA'));
  });

  it('refuses another institution and anyone not signed in', async () => {
    await assertFails(readFile('outsiderAdmin', 'forA'));
    await assertFails(getDoc(doc(anonymous(), filePath('forA'))));
  });
});

describe('a parent reading one file', () => {
  it('allows a file of a class on their list', async () => {
    await assertSucceeds(readFile('parentA', 'forA'));
  });

  it('refuses a file of another class', async () => {
    await assertFails(readFile('parentB', 'forA'));
  });

  it('allows any class of a note for several, not only the first', async () => {
    await assertSucceeds(readFile('parentA', 'forBthenA'));
    await assertSucceeds(readFile('parentB', 'forBthenA'));
  });

  it('reads a note from before several classes by its classId', async () => {
    await assertSucceeds(readFile('parentA', 'olderForA'));
    await assertFails(readFile('parentB', 'olderForA'));
  });

  it('refuses a parent with an empty list or none', async () => {
    await seedDoc('users/emptyList', { role: 'parent', institutionId: INST, status: 'active', linkedClassIds: [] });
    await seedDoc('users/noList', { role: 'parent', institutionId: INST, status: 'active' });
    await assertFails(readFile('emptyList', 'forA'));
    await assertFails(readFile('noList', 'forA'));
  });

  it('refuses a file of a note with no class', async () => {
    await assertFails(readFile('parentA', 'noClass'));
  });

  it('still lets the parent read the note itself, as the query needs', async () => {
    await assertSucceeds(getDoc(doc(as('parentB'), notePath('forA'))));
  });

  it('does not count a list on someone who is not a parent', async () => {
    await seedDoc('users/studentWithList', { role: 'student', institutionId: INST, status: 'active', classId: CLASS_B, classIds: [CLASS_B], linkedClassIds: [CLASS_A] });
    await assertFails(readFile('studentWithList', 'forA'));
  });
});

describe('the list on a parent’s user document', () => {
  const setList = (uid: string, target: string) => updateDoc(doc(as(uid), 'users', target), { linkedClassIds: [CLASS_A, CLASS_B] });

  it('cannot be changed by the parent', async () => {
    await assertFails(setList('parentA', 'parentA'));
  });

  it('can be changed by an administrator of the institution, and no one else', async () => {
    await assertSucceeds(setList('admin', 'parentA'));
    for (const uid of ['outsiderAdmin', 'teacherA', 'seniorSame', 'spectator', 'studentA']) await assertFails(setList(uid, 'parentA'));
  });
});

describe('listing a note’s files', () => {
  const listFiles = (uid: string, noteId: string) => getDocs(collection(as(uid), `${notePath(noteId)}/attachment`));

  it('lets those who can delete the note list them', async () => {
    for (const uid of ['admin', 'teacherA', 'seniorSame']) await assertSucceeds(listFiles(uid, 'forA'));
  });

  it('refuses everyone else, even for their own class', async () => {
    for (const uid of ['studentA', 'studentB', 'parentA', 'spectator', 'teacherB', 'seniorOther', 'outsiderAdmin']) {
      await assertFails(listFiles(uid, 'forA'));
    }
  });
});
