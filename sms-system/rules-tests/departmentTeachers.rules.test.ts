import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import {
  DEPT,
  INST,
  OTHER_DEPT,
  as,
  assertFails,
  assertSucceeds,
  resetAndSeedUsers,
  seed,
  startEnv,
  stopEnv,
} from './helpers';

// A senior teacher may read the teachers of their OWN department (firestore.rules, `match /users/{uid}`): the
// timetable-slot form's teacher list and the Schedule page's edit check (hooks/useDepartmentTeachers.ts). Nobody
// else's profile opens up: other departments' teachers, admins and parents stay closed, and a regular teacher still
// reads students only.

beforeAll(async () => {
  await startEnv();
});
afterAll(stopEnv);
beforeEach(async () => {
  await resetAndSeedUsers();
  await seed((db) =>
    setDoc(doc(db, 'users', 'seniorNoDept'), { role: 'senior_teacher', institutionId: INST, status: 'active' }),
  );
});

const departmentTeachers = (uid: string, departmentId: string) =>
  getDocs(
    query(
      collection(as(uid), 'users'),
      where('institutionId', '==', INST),
      where('role', 'in', ['regular_teacher', 'senior_teacher']),
      where('departmentId', '==', departmentId),
    ),
  );

describe('a senior teacher reading teacher profiles', () => {
  it("lists their own department's teachers", async () => {
    await assertSucceeds(departmentTeachers('seniorSame', DEPT));
    await assertSucceeds(getDoc(doc(as('seniorSame'), 'users', 'teacherA')));
  });

  it("refuses another department's teachers, one by one or as a list", async () => {
    await assertFails(getDoc(doc(as('seniorOther'), 'users', 'teacherA')));
    await assertFails(departmentTeachers('seniorOther', DEPT));
  });

  it('refuses a list without the department filter', async () => {
    await assertFails(
      getDocs(
        query(
          collection(as('seniorSame'), 'users'),
          where('institutionId', '==', INST),
          where('role', 'in', ['regular_teacher', 'senior_teacher']),
        ),
      ),
    );
  });

  it('keeps admins and parents closed', async () => {
    await assertFails(getDoc(doc(as('seniorSame'), 'users', 'admin')));
    await assertFails(getDoc(doc(as('seniorSame'), 'users', 'parentA')));
  });

  it('gives a senior teacher with no department no teachers', async () => {
    await assertFails(getDoc(doc(as('seniorNoDept'), 'users', 'teacherA')));
  });
});

describe('a regular teacher', () => {
  it("still reads students only, never a colleague's profile", async () => {
    await assertSucceeds(getDoc(doc(as('teacherA'), 'users', 'studentA')));
    await assertFails(getDoc(doc(as('teacherA'), 'users', 'teacherB')));
    await assertFails(departmentTeachers('teacherA', DEPT));
  });
});

describe('the department is compared by id', () => {
  it('refuses a list filtered by a department name', async () => {
    await assertFails(departmentTeachers('seniorSame', 'Mathematics'));
  });

  it("refuses a senior teacher reading OTHER_DEPT's list from DEPT", async () => {
    await assertFails(departmentTeachers('seniorSame', OTHER_DEPT));
  });
});
