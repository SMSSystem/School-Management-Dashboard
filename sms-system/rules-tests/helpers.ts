import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, type Firestore } from 'firebase/firestore';

// Shared setup for the Firestore security-rules tests. They run against the Firestore emulator with the real
// firestore.rules (`npm run test:rules`). Rules compare against `request.time`, the server's clock, so every time
// here is relative to the real clock.

export { assertFails, assertSucceeds };

export const INST = 'inst1';
export const OTHER_INST = 'inst2';
export const EXAM = 'exam1';
export const DEPT = 'dept1';
export const OTHER_DEPT = 'dept2';
export const CLASS_A = 'classA';
export const CLASS_B = 'classB';

const MINUTE_MS = 60_000;

/** A Timestamp this many minutes from now (negative for the past). */
export const minutesFromNow = (minutes: number): Timestamp => Timestamp.fromMillis(Date.now() + minutes * MINUTE_MS);

type UserSeed = Record<string, unknown>;

// Everyone who appears in the tests. The uid is the key.
export const USERS: Record<string, UserSeed> = {
  admin: { role: 'institution_admin', institutionId: INST },
  spectator: { role: 'spectator', institutionId: INST },
  teacherA: { role: 'regular_teacher', institutionId: INST, departmentId: DEPT },
  teacherB: { role: 'regular_teacher', institutionId: INST, departmentId: DEPT },
  seniorSame: { role: 'senior_teacher', institutionId: INST, departmentId: DEPT },
  seniorOther: { role: 'senior_teacher', institutionId: INST, departmentId: OTHER_DEPT },
  studentA: { role: 'student', institutionId: INST, classId: CLASS_A, classIds: [CLASS_A] },
  studentA2: { role: 'student', institutionId: INST, classId: CLASS_A, classIds: [CLASS_A] },
  studentB: { role: 'student', institutionId: INST, classId: CLASS_B, classIds: [CLASS_B] },
  // Home class B plus an additional class A.
  studentBplusA: { role: 'student', institutionId: INST, classId: CLASS_B, classIds: [CLASS_B, CLASS_A] },
  parentA: { role: 'parent', institutionId: INST },
  parentB: { role: 'parent', institutionId: INST },
  outsiderAdmin: { role: 'institution_admin', institutionId: OTHER_INST },
};

let env: RulesTestEnvironment | undefined;
// A signed-in client is slow to create (it opens its own connection), so each user's is made once per file.
const clients = new Map<string, Firestore>();

/** Starts the test environment (once per test file) with the real rules. */
export async function startEnv(): Promise<RulesTestEnvironment> {
  env = await initializeTestEnvironment({
    projectId: 'demo-sms-rules',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  return env;
}

export async function stopEnv(): Promise<void> {
  clients.clear();
  await env?.cleanup();
  env = undefined;
}

function need(): RulesTestEnvironment {
  if (!env) throw new Error('startEnv() has not been called');
  return env;
}

/** Empties the database and writes the users and the parent links. Call from beforeEach. */
export async function resetAndSeedUsers(): Promise<void> {
  const e = need();
  await e.clearFirestore();
  await e.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(USERS)) await setDoc(doc(db, 'users', uid), { status: 'active', ...data });
    // parentA is linked to studentA, parentB to studentB (the id format the results rule uses).
    await setDoc(doc(db, 'student_parents', 'parentA_studentA'), { parentId: 'parentA', studentId: 'studentA', institutionId: INST });
    await setDoc(doc(db, 'student_parents', 'parentB_studentB'), { parentId: 'parentB', studentId: 'studentB', institutionId: INST });
  });
}

/** Writes documents with the rules switched off, for the state a test starts from. */
export async function seed(write: (db: Firestore) => Promise<void>): Promise<void> {
  await need().withSecurityRulesDisabled(async (ctx) => write(ctx.firestore() as unknown as Firestore));
}

/** A Firestore client signed in as the user (a key of USERS). */
export function as(uid: string): Firestore {
  let db = clients.get(uid);
  if (!db) {
    db = need().authenticatedContext(uid).firestore() as unknown as Firestore;
    clients.set(uid, db);
  }
  return db;
}

/** A client with no sign-in. */
export function anonymous(): Firestore {
  let db = clients.get('');
  if (!db) {
    db = need().unauthenticatedContext().firestore() as unknown as Firestore;
    clients.set('', db);
  }
  return db;
}

export const examPath = (id = EXAM, inst = INST) => `institutions/${inst}/exams/${id}`;

/** A schedule-only exam, as the current exam form writes it. */
export function scheduleExam(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    institutionId: INST,
    termId: 'term1',
    termName: 'Term 1',
    subjectId: 'subj1',
    subjectName: 'Maths',
    classId: CLASS_A,
    className: 'Class A',
    teacherId: 'teacherA',
    teacherName: 'Teacher A',
    departmentId: DEPT,
    date: '2026-11-02',
    createdBy: 'teacherA',
    createdByRole: 'regular_teacher',
    createdAt: Timestamp.now(),
    ...over,
  };
}
