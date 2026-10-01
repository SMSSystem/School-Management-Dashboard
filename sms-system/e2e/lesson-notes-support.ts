import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import process from 'node:process';
import { initializeApp as initAdminApp, cert, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { initializeApp as initClientApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { expect } from '@playwright/test';

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
  const snap = await db().collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) throw new Error(`No users doc for ${email}`);
  const d = snap.docs[0].data();
  return {
    uid: snap.docs[0].id,
    name: (d.name as string) ?? (d.displayName as string) ?? '',
    role: d.role as string,
    departmentId: d.departmentId as string | undefined,
    classId: d.classId as string | undefined,
  };
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
    ...(n.attachment && {
      attachmentFileName: n.attachment.fileName,
      attachmentMimeType: n.attachment.mimeType,
      attachmentSize: n.attachment.size,
    }),
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

export async function attachmentDoc(noteId: string) {
  const iid = await institutionId();
  const snap = await notesCol(iid).doc(noteId).collection('attachment').doc('data').get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

// Removes every note (and its attachment/data) whose name starts with
// NOTE_PREFIX. Strictly prefix-scoped — nothing else in the institution is
// touched. A single-field range query, so no composite index is needed.
export async function sweepQaNotes(): Promise<number> {
  const iid = await institutionId();
  const snap = await notesCol(iid)
    .where('name', '>=', NOTE_PREFIX)
    .where('name', '<=', `${NOTE_PREFIX}`)
    .get();
  for (const d of snap.docs) {
    await d.ref.collection('attachment').doc('data').delete();
    await d.ref.delete();
  }
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
