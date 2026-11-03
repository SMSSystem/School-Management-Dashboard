import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import process from 'node:process';
import { initializeApp as initAdminApp, cert, getApps as getAdminApps } from 'firebase-admin/app';
import { FieldValue, getFirestore as getAdminFirestore, Timestamp as AdminTimestamp, type DocumentReference } from 'firebase-admin/firestore';
import { initializeApp as initClientApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { expect } from '@playwright/test';
import { qaEmail } from './qa-names';

// Support code for e2e/09-lesson-notes.spec.ts. Deliberately imports only
// firebase-admin/app + firebase-admin/firestore (never firebase-admin/auth):
// 08-assignments-workflow.spec.ts documents that auth's jwks-rsa dependency
// broke Playwright's own test loader.

// The Firebase web config for the Node-side rule probes lives in .env (the
// VITE_FIREBASE_* vars); playwright.config.ts only loads .env.qa.
try {
  process.loadEnvFile('.env');
} catch {
  // Missing .env — the probes fail with a clear "missing config" error below.
}

export const NOTE_PREFIX = 'QA Lesson Note';

// ── Admin SDK (ground truth + seeding + cleanup, bypasses rules) ────────────

const SERVICE_ACCOUNT_PATH = 'scripts/service-account.json';
export const HAS_ADMIN_SDK = existsSync(SERVICE_ACCOUNT_PATH);
if (HAS_ADMIN_SDK && getAdminApps().length === 0) {
  initAdminApp({ credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))) });
}
export const adminDb = HAS_ADMIN_SDK ? getAdminFirestore() : null;

export function db() {
  if (!adminDb) throw new Error('scripts/service-account.json is required for this spec');
  return adminDb;
}

let cachedInstitutionId: string | null = null;
export async function institutionId(): Promise<string> {
  if (cachedInstitutionId) return cachedInstitutionId;
  const name = process.env.QA_INSTITUTION_NAME;
  const snap = await db().collection('institutions').where('name', '==', name).limit(1).get();
  if (snap.empty) throw new Error(`Institution "${name}" not found`);
  cachedInstitutionId = snap.docs[0].id;
  return cachedInstitutionId;
}

export type UserInfo = { uid: string; name: string; role: string; departmentId?: string; classId?: string };

export async function userByEmail(email: string): Promise<UserInfo> {
  const snap = await db().collection('users').where('email', '==', email).get();
  if (snap.empty) throw new Error(`No users doc for ${email}`);
  // Never silently pick one of several documents sharing an email. Several
  // QA emails (admin@demo.com, regularteacher@demo.com, ...) also have a stale
  // users doc in an older demo institution whose login account no longer
  // exists; taking limit(1) of those once made a department-less stale doc look
  // like the real teacher. The real account is the one in the QA institution;
  // if that is still ambiguous, fail loudly rather than guess.
  let docs = snap.docs;
  if (docs.length > 1) {
    const iid = await institutionId();
    const inQaInstitution = docs.filter((x) => x.data().institutionId === iid);
    if (inQaInstitution.length === 1) docs = inQaInstitution;
    else {
      throw new Error(
        `${docs.length} users docs share the email ${email} (${docs.map((x) => x.id).join(', ')}) — cannot tell which is the real account`,
      );
    }
  }
  const d = docs[0].data();
  return {
    uid: docs[0].id,
    name: (d.name as string) ?? (d.displayName as string) ?? '',
    role: d.role as string,
    departmentId: d.departmentId as string | undefined,
    classId: d.classId as string | undefined,
  };
}

// A regular teacher with NO departmentId — the state ISSUES_AND_GAPS.md #38
// is about, and one the admin forms can no longer produce (a department is now
// required wherever departments exist). Created once, outside the app's own
// forms: the Auth account via the web SDK's email/password sign-up (the same
// capability the app's own account-creation form uses), the users doc via the
// Admin SDK. Never given a department by any spec, so it stays a stable
// fixture. Idempotent.
export const NO_DEPT_TEACHER = {
  name: 'QaNoDept Teacher',
  email: qaEmail('nodept.teacher'),
  password: 'Teacher0123456789',
};

export async function ensureNoDepartmentTeacher(): Promise<UserInfo> {
  const existing = await db().collection('users').where('email', '==', NO_DEPT_TEACHER.email).limit(1).get();
  if (!existing.empty) return userByEmail(NO_DEPT_TEACHER.email);

  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  };
  const app = initClientApp(config, `signup-${Date.now()}`);
  let uid: string;
  try {
    uid = (await createUserWithEmailAndPassword(getAuth(app), NO_DEPT_TEACHER.email, NO_DEPT_TEACHER.password)).user.uid;
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/email-already-in-use') throw e;
    // A previous run created the login but died before writing the users doc.
    uid = (await signInWithEmailAndPassword(getAuth(app), NO_DEPT_TEACHER.email, NO_DEPT_TEACHER.password)).user.uid;
  } finally {
    await deleteApp(app).catch(() => undefined);
  }

  const [firstName, lastName] = NO_DEPT_TEACHER.name.split(' ');
  await db().collection('users').doc(uid).set({
    uid,
    firstName,
    lastName,
    name: NO_DEPT_TEACHER.name,
    email: NO_DEPT_TEACHER.email,
    phone: '',
    role: 'regular_teacher',
    institutionId: await institutionId(),
    status: 'active',
    // No departmentId on purpose.
    mustChangePassword: false,
    createdAt: AdminTimestamp.now(),
  });
  return userByEmail(NO_DEPT_TEACHER.email);
}

async function idByName(collection: string, name: string): Promise<string | null> {
  const snap = await db()
    .collection('institutions').doc(await institutionId())
    .collection(collection).where('name', '==', name).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}
export const classIdByName = (name: string) => idByName('classes', name);
export const subjectIdByName = (name: string) => idByName('subjects', name);

export async function allNames(collection: 'classes' | 'subjects'): Promise<string[]> {
  const snap = await db().collection('institutions').doc(await institutionId()).collection(collection).get();
  return snap.docs.map((d) => d.data().name as string);
}

// Same derivation as src/lib/teacherScope.ts, recomputed here from raw
// Firestore so the picker assertions don't just re-run the code under test.
export async function taughtNames(uid: string): Promise<{ subjects: string[]; classes: string[] }> {
  const iid = await institutionId();
  const [subjectsSnap, classesSnap] = await Promise.all([
    db().collection('institutions').doc(iid).collection('subjects').get(),
    db().collection('institutions').doc(iid).collection('classes').get(),
  ]);
  const taught = subjectsSnap.docs.filter((d) => ((d.data().teacherIds as string[] | undefined) ?? []).includes(uid));
  const allClasses = taught.some((d) => {
    const s = d.data();
    return s.classScope === 'institution' || !s.classIds || (s.classIds as string[]).length === 0;
  });
  const classIds = new Set(taught.flatMap((d) => (d.data().classIds as string[] | undefined) ?? []));
  return {
    subjects: taught.map((d) => d.data().name as string),
    classes: classesSnap.docs
      .filter((d) => allClasses || classIds.has(d.id))
      .map((d) => d.data().name as string),
  };
}

function notesCol(iid: string) {
  return db().collection('institutions').doc(iid).collection('lessonNotes');
}

export type SeedNote = {
  name: string;
  teacher: UserInfo;
  teacherRole: 'regular_teacher' | 'senior_teacher' | 'institution_admin';
  classId?: string;
  className?: string;
  subjectId?: string;
  subjectName?: string;
  links?: { url: string; label?: string }[];
  attachment?: { fileName: string; mimeType: string; dataUrl: string; size: number };
};

// Writes a note exactly the way LessonNoteForm would (so rules-shaped), but
// via the Admin SDK — used for fixtures whose creation isn't what a test is
// exercising.
export async function seedNote(n: SeedNote): Promise<string> {
  const iid = await institutionId();
  const ref = notesCol(iid).doc();
  const now = AdminTimestamp.now();
  await ref.set({
    institutionId: iid,
    name: n.name,
    ...(n.classId && { classId: n.classId, className: n.className ?? '' }),
    ...(n.subjectId && { subjectId: n.subjectId, subjectName: n.subjectName ?? '' }),
    teacherId: n.teacher.uid,
    teacherName: n.teacher.name,
    teacherRole: n.teacherRole,
    ...(n.teacher.departmentId && { departmentId: n.teacher.departmentId }),
    hasAttachment: !!n.attachment,
    // Several files per note: the metadata list and the file document ids. A seeded
    // file keeps the id `data`, so attachmentDoc(noteId) finds it.
    attachments: n.attachment
      ? [{ id: 'data', fileName: n.attachment.fileName, mimeType: n.attachment.mimeType, size: n.attachment.size }]
      : [],
    attachmentIds: n.attachment ? ['data'] : [],
    resourceLinks: n.links ?? [],
    createdBy: n.teacher.uid,
    createdByRole: n.teacherRole,
    createdAt: now,
    updatedAt: now,
  });
  if (n.attachment) {
    await ref.collection('attachment').doc('data').set({
      dataUrl: n.attachment.dataUrl,
      fileName: n.attachment.fileName,
      mimeType: n.attachment.mimeType,
      size: n.attachment.size,
    });
  }
  return ref.id;
}

export async function noteByName(name: string) {
  const iid = await institutionId();
  const snap = await notesCol(iid).where('name', '==', name).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as Record<string, unknown> & { id: string };
}

/** One of a note's file documents: the given id, else the note's first file (a note with none: `data`). */
export async function attachmentDoc(noteId: string, fileId?: string) {
  const iid = await institutionId();
  let id = fileId;
  if (!id) {
    const note = await notesCol(iid).doc(noteId).get();
    id = (note.data()?.attachmentIds as string[] | undefined)?.[0] ?? 'data';
  }
  const snap = await notesCol(iid).doc(noteId).collection('attachment').doc(id).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

/** The ids of a note's file documents, as recorded on the note. */
export async function noteFileIds(noteId: string): Promise<string[]> {
  const iid = await institutionId();
  return ((await notesCol(iid).doc(noteId).get()).data()?.attachmentIds as string[] | undefined) ?? [];
}

/** The file names listed on a note. */
export async function noteFileNames(noteId: string): Promise<string[]> {
  const iid = await institutionId();
  const list = ((await notesCol(iid).doc(noteId).get()).data()?.attachments as { fileName: string }[] | undefined) ?? [];
  return list.map((f) => f.fileName);
}

// Every file document of a note, whatever its id: files saved through the form have
// random ids, and a record left behind shows up in the sweep as pointing at a missing file.
async function deleteNoteFiles(note: DocumentReference): Promise<void> {
  const files = await note.collection('attachment').select().get();
  for (const file of files.docs) await file.ref.delete();
}

// Removes every note (and its file documents) whose name starts with
// NOTE_PREFIX. Strictly prefix-scoped — nothing else in the institution is
// touched. A single-field range query, so no composite index is needed.
export async function sweepQaNotes(): Promise<number> {
  const iid = await institutionId();
  const snap = await notesCol(iid)
    .where('name', '>=', NOTE_PREFIX)
    .where('name', '<=', `${NOTE_PREFIX}`)
    .get();
  for (const d of snap.docs) {
    await deleteNoteFiles(d.ref);
    await d.ref.delete();
  }
  return snap.size;
}

// Deletes ONE note and its file documents — for specs that seeded a note
// themselves and must clean up only that, not every NOTE_PREFIX note.
export async function deleteNoteById(noteId: string): Promise<void> {
  const iid = await institutionId();
  const ref = notesCol(iid).doc(noteId);
  await deleteNoteFiles(ref);
  await ref.delete();
}

// Deletes every note whose name is exactly `name` (e.g. leftovers from an
// interrupted earlier run of the spec that seeds it). Exact-match only.
export async function deleteNotesNamed(name: string): Promise<number> {
  const iid = await institutionId();
  const snap = await notesCol(iid).where('name', '==', name).get();
  for (const d of snap.docs) await deleteNoteById(d.id);
  return snap.size;
}

// Exams/assignments a teacher created against one subject — used by the
// teacher-department spec, whose QA subject is exclusive to these fixtures, so
// scoping by (collection, teacher, subject) can't touch anything else.
export async function docsByTeacherAndSubject(
  collection: 'exams' | 'assignments',
  teacherUid: string,
  subjectId: string,
) {
  const iid = await institutionId();
  const snap = await db()
    .collection('institutions').doc(iid)
    .collection(collection)
    .where('teacherId', '==', teacherUid)
    .where('subjectId', '==', subjectId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }));
}

export async function deleteDocsByTeacherAndSubject(
  collection: 'exams' | 'assignments',
  teacherUid: string,
  subjectId: string,
): Promise<number> {
  const iid = await institutionId();
  const snap = await db()
    .collection('institutions').doc(iid)
    .collection(collection)
    .where('teacherId', '==', teacherUid)
    .where('subjectId', '==', subjectId)
    .get();
  for (const d of snap.docs) await d.ref.delete();
  return snap.size;
}

// ── Fixture protection for rule probes ──────────────────────────────────────
// A "should be denied" probe really WRITES if the rule it tests isn't deployed
// yet (or is wrong). These put the touched fields back through the Admin SDK
// (which bypasses rules) so a failing probe can't leave a shared QA account
// altered. Always call restoreUserFields() in a finally block.

export async function snapshotUser(uid: string): Promise<Record<string, unknown>> {
  const snap = await db().collection('users').doc(uid).get();
  return (snap.data() ?? {}) as Record<string, unknown>;
}

export async function restoreUserFields(
  uid: string,
  before: Record<string, unknown>,
  fields: string[],
): Promise<void> {
  const patch: Record<string, unknown> = {};
  for (const f of fields) patch[f] = f in before ? before[f] : FieldValue.delete();
  await db().collection('users').doc(uid).update(patch);
}

export async function setUserFields(uid: string, patch: Record<string, unknown>): Promise<void> {
  await db().collection('users').doc(uid).update(patch);
}

export async function deleteByPath(path: string): Promise<void> {
  await db().doc(path).delete();
}

export async function docAtPath(path: string): Promise<(Record<string, unknown> & { id: string }) | null> {
  const snap = await db().doc(path).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as Record<string, unknown> & { id: string }) : null;
}

// Institution admins in the QA institution other than `exceptUid` — the target
// for "an admin can't edit another admin".
export async function otherInstitutionAdmins(exceptUid: string): Promise<UserInfo[]> {
  const iid = await institutionId();
  const snap = await db()
    .collection('users')
    .where('institutionId', '==', iid)
    .where('role', '==', 'institution_admin')
    .get();
  return snap.docs
    .filter((d) => d.id !== exceptUid)
    .map((d) => ({ uid: d.id, name: (d.data().name as string) ?? '', role: 'institution_admin' }));
}

export async function auditEntriesFor(targetUid: string) {
  const iid = await institutionId();
  const snap = await db()
    .collection('institutions').doc(iid)
    .collection('audit_log')
    .where('targetUid', '==', targetUid)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }));
}

export async function deleteAuditEntriesFor(targetUid: string): Promise<number> {
  const iid = await institutionId();
  const snap = await db()
    .collection('institutions').doc(iid)
    .collection('audit_log')
    .where('targetUid', '==', targetUid)
    .get();
  for (const d of snap.docs) await d.ref.delete();
  return snap.size;
}

export async function linkParentToStudent(parentUid: string, studentUid: string, adminUid: string): Promise<void> {
  // Same document shape the student detail page's "Link" button writes
  // (list/students/[id]/index.tsx). Written via the Admin SDK here rather
  // than the page because 08-assignments-workflow documents that page's live
  // listener as unreliable; the link UI itself is not what this spec tests.
  const iid = await institutionId();
  await db().collection('student_parents').doc(`${parentUid}_${studentUid}`).set(
    {
      parentId: parentUid,
      studentId: studentUid,
      institutionId: iid,
      relationship: 'guardian',
      createdAt: AdminTimestamp.now(),
      createdBy: adminUid,
    },
    { merge: true },
  );
}

export function persistCredential(key: string, value: string): void {
  const path = '.env.qa';
  const contents = readFileSync(path, 'utf8');
  const line = `${key}="${value}"`;
  const updated = contents.includes(`${key}=`)
    ? contents.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${contents.trimEnd()}\n${line}\n`;
  writeFileSync(path, updated);
  process.env[key] = value;
}

// ── Node web-SDK probe client (real rule enforcement, no browser) ───────────

export type Probe = { db: Firestore; uid: string; close: () => Promise<void> };

let probeCounter = 0;

export async function openProbe(email: string, password: string): Promise<Probe> {
  const config = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.projectId) {
    throw new Error('VITE_FIREBASE_* missing from .env — cannot open a rule probe');
  }
  const app: FirebaseApp = initClientApp(config, `probe-${++probeCounter}-${Date.now()}`);
  const cred = await signInWithEmailAndPassword(getAuth(app), email, password);
  return {
    db: getFirestore(app),
    uid: cred.user.uid,
    close: () => deleteApp(app),
  };
}

type FirestoreErrorLike = { code?: string; message?: string };

// A denial is only meaningful if it is specifically permission-denied: any
// other failure (App Check enforcement, network, auth) would otherwise pass a
// "should be denied" assertion for the wrong reason. Pair every denial with a
// positive control on the same probe.
export async function expectDenied(label: string, op: Promise<unknown>): Promise<void> {
  let err: FirestoreErrorLike | null = null;
  try {
    await op;
  } catch (e) {
    err = e as FirestoreErrorLike;
  }
  expect(err, `${label}: expected permission-denied but the operation succeeded`).not.toBeNull();
  expect(err?.code, `${label}: failed, but not with permission-denied (${err?.message})`).toBe('permission-denied');
}

export async function expectAllowed(label: string, op: Promise<unknown>): Promise<void> {
  try {
    await op;
  } catch (e) {
    const err = e as FirestoreErrorLike;
    throw new Error(`${label}: expected to succeed but failed with ${err.code}: ${err.message}`, { cause: e });
  }
}
