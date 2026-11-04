import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDoc, doc, getDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { CLASS_A, CLASS_B, INST, OTHER_INST, as, assertFails, resetAndSeedUsers, seed, seedDoc, startEnv, stopEnv } from './helpers';

// Saving a parent's class list as the app does (src/lib/parentLinkedClasses.ts), through the real rules, so this catches
// what a test with a fake Firestore cannot. A leftover link to someone who no longer exists must not fail a save.

const signedIn = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../src/lib/firebase', () => ({
  get db() {
    return signedIn.db;
  },
}));

import { addParentClassUpdates, parentClassUpdates, studentClassChangeUpdates } from '../src/lib/parentLinkedClasses';
import { linkParent, unlinkParent } from '../src/lib/studentDetailSave';

const link = (parentId: string, studentId: string, institutionId = INST) =>
  seedDoc(`student_parents/${parentId}_${studentId}`, { parentId, studentId, institutionId });

const listOf = async (uid: string) => {
  let list: unknown;
  await seed(async (db) => {
    list = (await getDoc(doc(db, 'users', uid))).data()?.linkedClassIds;
  });
  return list;
};

/** Saves the lists in a batch, as every caller does. */
async function save(updates: Awaited<ReturnType<typeof parentClassUpdates>>): Promise<void> {
  const batch = writeBatch(signedIn.db as Firestore);
  addParentClassUpdates(batch, updates);
  await batch.commit();
}

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  signedIn.db = as('admin');
});

describe('why the helper does not read a user by id', () => {
  it('an administrator is refused a user who does not exist', async () => {
    await assertFails(getDoc(doc(as('admin'), 'users', 'gone')));
  });

  it('an administrator is refused a user of another institution', async () => {
    await assertFails(getDoc(doc(as('admin'), 'users', 'outsiderAdmin')));
  });
});

describe('a leftover link does not fail a save', () => {
  it('skips a link to a student who no longer exists', async () => {
    await link('parentA', 'gone');
    await save(await parentClassUpdates(INST, [{ parentId: 'parentA', add: ['studentB'] }]));
    expect(await listOf('parentA')).toEqual([CLASS_A, CLASS_B]);
  });

  it('leaves out a parent who no longer exists, when a student’s classes change', async () => {
    await link('gone', 'studentA');
    const before = { classId: CLASS_A, classIds: [CLASS_A] };
    const after = { classId: CLASS_B, classIds: [CLASS_B] };
    await save(await studentClassChangeUpdates(INST, 'studentA', before, after));
    expect(await listOf('parentA')).toEqual([CLASS_B]);
  });

  it('skips a child of another institution', async () => {
    await seedDoc('users/otherKid', { role: 'student', institutionId: OTHER_INST, classId: 'x', classIds: ['x'] });
    await link('parentA', 'otherKid');
    await save(await parentClassUpdates(INST, [{ parentId: 'parentA' }]));
    expect(await listOf('parentA')).toEqual([CLASS_A]);
  });

  it('leaves out a parent of another institution', async () => {
    await seedDoc('users/otherParent', { role: 'parent', institutionId: OTHER_INST });
    expect(await parentClassUpdates(INST, [{ parentId: 'otherParent', add: ['studentA'] }])).toEqual([]);
  });
});

describe('the saves', () => {
  it('linking a parent adds the child’s classes, with the link', async () => {
    await linkParent({ parentId: 'parentA', studentId: 'studentB', institutionId: INST, relationship: 'guardian', uid: 'admin' });
    expect(await listOf('parentA')).toEqual([CLASS_A, CLASS_B]);
  });

  it('unlinking a parent removes the child’s classes, with the link', async () => {
    await unlinkParent({ docId: 'parentA_studentA', parentId: 'parentA', studentId: 'studentA', institutionId: INST });
    expect(await listOf('parentA')).toEqual([]);
  });

  it('keeps a class another child is still in', async () => {
    await link('parentA', 'studentA2');
    await unlinkParent({ docId: 'parentA_studentA', parentId: 'parentA', studentId: 'studentA', institutionId: INST });
    expect(await listOf('parentA')).toEqual([CLASS_A]);
  });

  it('a class change updates the student and their parent in one batch', async () => {
    const before = { classId: CLASS_A, classIds: [CLASS_A] };
    const after = { classId: CLASS_B, classIds: [CLASS_B] };
    const updates = await studentClassChangeUpdates(INST, 'studentA', before, after);
    const batch = writeBatch(as('admin'));
    batch.update(doc(as('admin'), 'users', 'studentA'), after);
    addParentClassUpdates(batch, updates);
    await batch.commit();
    expect(await listOf('parentA')).toEqual([CLASS_B]);
  });

  it('deleting a student removes their classes when the links are already gone', async () => {
    await seed((db) => deleteDoc(doc(db, 'student_parents', 'parentA_studentA')));
    await save(await parentClassUpdates(INST, [{ parentId: 'parentA', remove: ['studentA'] }]));
    expect(await listOf('parentA')).toEqual([]);
  });

  it('a super administrator’s save works out nothing with no institution selected', async () => {
    expect(await parentClassUpdates('*', [{ parentId: 'parentA' }])).toEqual([]);
  });
});

describe('who can save', () => {
  it('refuses a parent changing their own list', async () => {
    await assertFails(updateDoc(doc(as('parentA'), 'users', 'parentA'), { linkedClassIds: [CLASS_B] }));
  });
});
