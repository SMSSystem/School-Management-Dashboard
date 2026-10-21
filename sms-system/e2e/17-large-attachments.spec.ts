import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import process from 'node:process';
import { forceLiveData, login, dismissTourIfPresent } from './helpers';
import {
  NOTE_PREFIX,
  attachmentDoc,
  noteFileIds,
  noteFileNames,
  classIdByName,
  db,
  deleteNoteById,
  noteByName,
  seedNote,
  subjectIdByName,
  userByEmail,
  type UserInfo,
} from './lesson-notes-support';
import {
  HAS_RTDB,
  PROJECT_ID,
  blobExists,
  blobMeta,
  counters,
  institutionId,
  listBlobKeys,
  pdfBuffer,
  removeBlob,
  removeBlobsExcept,
  restoreCounters,
  rtdb,
  seedBlob,
  type Counters,
} from './large-files-support';

// LARGE_ATTACHMENTS_RTDB_SPEC.md Phase 7: a real browser against the live QA
// institution, with ground truth read from the Realtime Database through the
// Admin SDK. A teacher's lesson-note file or assignment attachment over 500KB
// (up to 5MB) is stored in the Realtime Database and Firestore holds only its key.
//
// The QA institution sits inside the production Firebase project, so the files
// and the byte counters this spec touches are production data. Every file it
// creates is removed again and the counters are put back to the baseline taken
// before the run.
//
// Not covered here (done by hand, see the spec): a real slow-network upload with
// the session lock on (Playwright's throttling does not slow WebSockets).

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const LESSONS_HREF = '/dashboard/list/lesson-notes';
const ASSIGNMENTS_HREF = '/dashboard/list/assignments';
const CLASS_A_NAME = 'QA Assignments Class';
const SUBJECT_NAME = 'QA Lessons Subject';
const TERM_NAME = 'Christmas Term';
const MB = 1024 * 1024;
// The lesson note form lists several files ("max each, up to 5 files"); the assignment form takes one ("max.").
const NOTE_LIMIT_TEXT = 'PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP — 5MB max each, up to 5 files.';
const LIMIT_TEXT = 'PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP — 5MB max.';

const NOTE = `${NOTE_PREFIX} Large File`;
const SEEDED_NOTE = `${NOTE_PREFIX} Large Seeded`;
// A due date far from 08's fixtures so this spec's assignment row is unambiguous.
const DUE_OFFSET_DAYS = 91;

const CREDS = {
  teacher: {
    email: process.env.QA_LESSONS_TEACHER_EMAIL ?? 'qa.lessons.teacher@demo.com',
    password: process.env.QA_LESSONS_TEACHER_PASSWORD ?? 'Teacher0123456789',
  },
  admin: { email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD },
  student: { email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL, password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD },
  parent: { email: process.env.QA_ASSIGNMENTS_PARENT_EMAIL, password: process.env.QA_ASSIGNMENTS_PARENT_PASSWORD },
  spectator: { email: process.env.QA_SPECTATOR_EMAIL, password: process.env.QA_SPECTATOR_PASSWORD },
};
type Who = keyof typeof CREDS;

async function loginAs(page: Page, who: Who): Promise<void> {
  const c = CREDS[who];
  if (!c.email || !c.password) throw new Error(`QA credentials for ${who} are missing from .env.qa`);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: c.email, password: c.password });
  if (page.url().includes('/change-password')) {
    await page.getByLabel('New Password', { exact: true }).fill(c.password);
    await page.getByLabel('Confirm New Password', { exact: true }).fill(c.password);
    await page.getByRole('button', { name: 'Set Password & Continue' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  }
  if (who === 'admin') await dismissTourIfPresent(page);
}

const row = (page: Page, name: string) => page.locator('tr', { hasText: name }).first();

// ── State shared by the serial tests ────────────────────────────────────────

let iid = '';
let baseline: Counters;
let preExisting = new Set<string>();
let teacher: UserInfo;
const createdAssignmentIds: string[] = [];
const seededKeys: string[] = [];
const seededNoteIds: string[] = [];

/** Counters must equal the baseline plus `extra` bytes, in both places. */
async function expectCounters(extra: number) {
  await expect
    .poll(async () => counters(iid), { timeout: 20_000, message: `counters should be baseline + ${extra}` })
    .toEqual({ institution: baseline.institution + extra, total: baseline.total + extra });
}

async function newKeys(): Promise<string[]> {
  return (await listBlobKeys(iid)).filter((k) => !preExisting.has(k));
}

async function openNoteForm(page: Page) {
  await page.goto(LESSONS_HREF);
  await dismissTourIfPresent(page);
  await page.getByRole('button', { name: 'Add new lesson note' }).click();
  await expect(page.locator('h1', { hasText: 'Create a new lesson note' })).toBeVisible();
}

async function fillNoteBasics(page: Page, name: string) {
  await page.locator('input[name="name"]').fill(name);
  // The note form's subjects and classes are checkbox lists (a note can be for several).
  await page.getByRole('group', { name: 'Subjects' }).getByLabel(SUBJECT_NAME, { exact: true }).check();
  await page.getByRole('group', { name: 'Classes' }).getByLabel(CLASS_A_NAME, { exact: true }).check();
  await page.getByLabel('Link 1 URL').fill('https://example.com/large-file-qa');
}

async function createNote(page: Page, name: string, file: { name: string; size: number }) {
  await openNoteForm(page);
  await fillNoteBasics(page, name);
  await page.locator('input[type="file"]').setInputFiles({ name: file.name, mimeType: 'application/pdf', buffer: pdfBuffer(file.size) });
  await expect(page.getByText(file.name)).toBeVisible();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Create a new lesson note' })).toHaveCount(0, { timeout: 120_000 });
}

async function openEditNote(page: Page, name: string) {
  await page.goto(LESSONS_HREF);
  await expect(row(page, name)).toBeVisible({ timeout: 15_000 });
  await row(page, name).getByRole('button', { name: `Edit ${name}` }).click();
  await expect(page.locator('h1', { hasText: 'Edit lesson note' })).toBeVisible();
}

async function submitEdit(page: Page) {
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Edit lesson note' })).toHaveCount(0, { timeout: 120_000 });
}

async function downloadFrom(page: Page, name: string, expectedFileName: string, expectedBytes: number) {
  await row(page, name).getByRole('button', { name: `View ${name}` }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe(expectedFileName);
  expect(statSync((await download.path())!).size).toBe(expectedBytes);
  await page.getByRole('button', { name: 'Close' }).click();
}

// ── Setup ───────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!HAS_RTDB, 'scripts/service-account.json and VITE_FIREBASE_DATABASE_URL (.env) are required');
  test.skip(!INSTITUTION_NAME, 'QA_INSTITUTION_NAME missing from .env.qa');
  iid = await institutionId();
  baseline = await counters(iid);
  preExisting = new Set(await listBlobKeys(iid));
  teacher = await userByEmail(CREDS.teacher.email);
});

test.afterAll(async () => {
  if (!HAS_RTDB || !INSTITUTION_NAME) return;
  // Notes and assignments first, then any file nobody refers to, then the counters.
  for (const id of seededNoteIds) await deleteNoteById(id).catch(() => undefined);
  for (const name of [NOTE, SEEDED_NOTE]) {
    let n = await noteByName(name);
    while (n) {
      await deleteNoteById(n.id);
      n = await noteByName(name);
    }
  }
  for (const id of createdAssignmentIds) {
    await db().collection('institutions').doc(iid).collection('assignments').doc(id).delete().catch(() => undefined);
  }
  for (const key of seededKeys) await removeBlob(iid, key).catch(() => undefined);
  await removeBlobsExcept(iid, preExisting);
  await restoreCounters(iid, baseline);
});

// ── Lesson notes ────────────────────────────────────────────────────────────

let firstKey = '';

test('teacher: a 1 MB lesson-note file is stored in the Realtime Database, not in the note', async ({ page, context }) => {
  test.setTimeout(240_000);
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await openNoteForm(page);
  await expect(page.getByText(NOTE_LIMIT_TEXT)).toBeVisible();
  await fillNoteBasics(page, NOTE);
  await page.locator('input[type="file"]').setInputFiles({ name: 'large-1mb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(MB) });
  await expect(page.getByText('large-1mb.pdf (1.0 MB)')).toBeVisible();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Create a new lesson note' })).toHaveCount(0, { timeout: 120_000 });

  await expect.poll(async () => (await noteByName(NOTE))?.hasAttachment, { timeout: 20_000 }).toBe(true);
  const note = (await noteByName(NOTE))!;
  expect(await noteFileNames(note.id)).toEqual(['large-1mb.pdf']);
  const att = (await attachmentDoc(note.id))!;
  expect(att, 'attachment/data should exist').not.toBeNull();
  expect(typeof att.blobKey).toBe('string');
  expect(att.dataUrl, 'the body must not also be in Firestore').toBeUndefined();
  expect(att.size).toBe(MB);
  firstKey = att.blobKey as string;

  const meta = await blobMeta(iid, firstKey);
  expect(meta, 'the file should be in the Realtime Database').not.toBeNull();
  expect(meta).toMatchObject({ size: MB, mimeType: 'application/pdf', uploadedBy: teacher.uid });
  expect(meta!.uploadedAt).toBeGreaterThan(Date.now() - 5 * 60_000);
  expect(await newKeys()).toEqual([firstKey]);
  await expectCounters(MB);
});

test('student and parent of the class download the large file in full', async ({ page, context }) => {
  test.setTimeout(240_000);
  await forceLiveData(context);
  for (const who of ['student', 'parent'] as const) {
    await loginAs(page, who);
    await page.goto(LESSONS_HREF);
    await expect(row(page, NOTE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Add new lesson note' })).toHaveCount(0);
    await downloadFrom(page, NOTE, 'large-1mb.pdf', MB);
    await page.context().clearCookies();
  }
});

test('teacher: replace, shrink to a small file, remove and delete keep the store and the counters tidy', async ({ page, context }) => {
  test.setTimeout(480_000);
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  const note = (await noteByName(NOTE))!;

  await test.step('replacing a large file with another large file removes the old one', async () => {
    await openEditNote(page, NOTE);
    await expect(page.getByText('large-1mb.pdf')).toBeVisible();
    await page.getByRole('button', { name: 'Remove large-1mb.pdf' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'large-600kb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(600 * 1024) });
    await submitEdit(page);
    await expect.poll(async () => (await attachmentDoc(note.id))?.fileName, { timeout: 20_000 }).toBe('large-600kb.pdf');
    const att = (await attachmentDoc(note.id))!;
    expect(att.blobKey).not.toBe(firstKey);
    expect(att.dataUrl).toBeUndefined();
    await expect.poll(() => blobExists(iid, firstKey), { timeout: 20_000 }).toBe(false);
    expect(await blobExists(iid, att.blobKey as string)).toBe(true);
    await expectCounters(600 * 1024);
  });

  await test.step('replacing a large file with a small one stores it inline and removes the old file', async () => {
    await openEditNote(page, NOTE);
    await page.getByRole('button', { name: 'Remove large-600kb.pdf' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'small-100kb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(100 * 1024) });
    await submitEdit(page);
    await expect.poll(async () => (await attachmentDoc(note.id))?.fileName, { timeout: 20_000 }).toBe('small-100kb.pdf');
    const att = (await attachmentDoc(note.id))!;
    expect(typeof att.dataUrl).toBe('string');
    expect(att.blobKey, 'a small file must not use the Realtime Database').toBeUndefined();
    await expect.poll(newKeys, { timeout: 20_000 }).toEqual([]);
    await expectCounters(0);
  });

  await test.step('removing a large file while keeping the link removes the file', async () => {
    await openEditNote(page, NOTE);
    await page.getByRole('button', { name: 'Remove small-100kb.pdf' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'large-700kb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(700 * 1024) });
    await submitEdit(page);
    await expect.poll(async () => (await attachmentDoc(note.id))?.fileName, { timeout: 20_000 }).toBe('large-700kb.pdf');
    expect(await newKeys()).toHaveLength(1);
    await expectCounters(700 * 1024);

    const removedFileId = (await noteFileIds(note.id))[0];
    await openEditNote(page, NOTE);
    await page.getByRole('button', { name: 'Remove large-700kb.pdf' }).click();
    await submitEdit(page);
    await expect.poll(async () => attachmentDoc(note.id, removedFileId), { timeout: 20_000 }).toBeNull();
    await expect.poll(newKeys, { timeout: 20_000 }).toEqual([]);
    await expectCounters(0);
  });

  await test.step('deleting a note with a large file removes the file', async () => {
    await openEditNote(page, NOTE);
    await page.locator('input[type="file"]').setInputFiles({ name: 'large-800kb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(800 * 1024) });
    await submitEdit(page);
    await expect.poll(async () => (await attachmentDoc(note.id))?.fileName, { timeout: 20_000 }).toBe('large-800kb.pdf');
    await expectCounters(800 * 1024);

    await page.goto(LESSONS_HREF);
    await row(page, NOTE).getByRole('button', { name: 'Delete lesson note' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => noteByName(NOTE), { timeout: 20_000 }).toBeNull();
    await expect.poll(newKeys, { timeout: 20_000 }).toEqual([]);
    await expectCounters(0);
  });
});

test('teacher: a file of exactly 5 MiB is accepted, stored and downloadable; 5 MiB + 1 is refused', async ({ page, context }) => {
  test.setTimeout(480_000);
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await createNote(page, NOTE, { name: 'max-5mib.pdf', size: 5 * MB });

  await expect.poll(async () => (await noteByName(NOTE))?.hasAttachment, { timeout: 30_000 }).toBe(true);
  const note = (await noteByName(NOTE))!;
  const att = (await attachmentDoc(note.id))!;
  const meta = await blobMeta(iid, att.blobKey as string);
  expect(meta?.size).toBe(5 * MB);
  await expectCounters(5 * MB);

  await page.goto(LESSONS_HREF);
  await downloadFrom(page, NOTE, 'max-5mib.pdf', 5 * MB);

  await openEditNote(page, NOTE);
  await page.locator('input[type="file"]').setInputFiles({ name: 'too-big.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(5 * MB + 1) });
  await expect(page.getByText('File must be 5MB or smaller.')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click().catch(() => undefined);

  // leave the store tidy for the next test
  await deleteNoteById(note.id);
  await removeBlob(iid, att.blobKey as string);
  await expectCounters(0);
});

test('a dropped connection during a save fails clearly and leaves no note and no file behind', async ({ page, context }) => {
  test.setTimeout(240_000);
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await openNoteForm(page);
  await fillNoteBasics(page, NOTE);
  await page.locator('input[type="file"]').setInputFiles({ name: 'dropped.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(2 * MB) });
  await expect(page.getByText('dropped.pdf')).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(/Could not reach the file store|could not be saved|taking too long|Failed to save/)).toBeVisible({ timeout: 150_000 });
  await context.setOffline(false);

  expect(await noteByName(NOTE), 'no note should have been created').toBeNull();
  expect(await newKeys(), 'no file should have been left behind').toEqual([]);
  await expectCounters(0);
});

// ── Assignments ─────────────────────────────────────────────────────────────

function assignmentRow(page: Page) {
  const due = new Date(Date.now() + DUE_OFFSET_DAYS * 86_400_000);
  const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  const label = new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return { iso, row: page.locator('tr').filter({ has: page.getByRole('link', { name: SUBJECT_NAME, exact: true }) }).filter({ hasText: label }).first() };
}

test('assignment: a 1 MB teacher attachment is stored by key; the student downloads it and may not submit over 500KB', async ({ page, context }) => {
  test.setTimeout(480_000);
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(ASSIGNMENTS_HREF);
  await dismissTourIfPresent(page);
  await page.getByRole('button', { name: 'Add new assignment' }).click();
  await expect(page.getByText(LIMIT_TEXT)).toBeVisible();
  const { iso, row: aRow } = assignmentRow(page);
  await page.locator('input[name="title"]').fill('QA Large Attachment');
  await page.locator('select[name="termId"]').selectOption({ label: TERM_NAME });
  await page.locator('select[name="subjectId"]').selectOption({ label: SUBJECT_NAME });
  await page.locator('select[name="classId"]').selectOption({ label: CLASS_A_NAME });
  await page.locator('input[name="dueDate"]').fill(iso);
  await page.locator('select[name="status"]').selectOption({ label: 'Published' });
  await page.locator('input[type="file"]').setInputFiles({ name: 'assignment-1mb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(MB) });
  await expect(page.getByText('assignment-1mb.pdf (1.0 MB)')).toBeVisible();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Create a new assignment' })).toHaveCount(0, { timeout: 120_000 });

  const snap = await db().collection('institutions').doc(iid).collection('assignments').where('title', '==', 'QA Large Attachment').get();
  expect(snap.size).toBe(1);
  createdAssignmentIds.push(snap.docs[0].id);
  const a = snap.docs[0].data();
  expect(typeof a.attachmentBlobKey).toBe('string');
  expect(a.attachmentDataUrl, 'the body must not also be on the assignment').toBeUndefined();
  expect(a.attachmentSize).toBe(MB);
  expect(await blobExists(iid, a.attachmentBlobKey)).toBe(true);
  await expectCounters(MB);

  await test.step('the student sees the file and downloads all of it', async () => {
    await page.context().clearCookies();
    await loginAs(page, 'student');
    await page.goto(ASSIGNMENTS_HREF);
    await assignmentRow(page).row.getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: 'Attachment' })).toBeVisible();
    await expect(page.getByText('assignment-1mb.pdf')).toBeVisible();
    await expect(page.getByText('1.0 MB')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
    expect(download.suggestedFilename()).toBe('assignment-1mb.pdf');
    expect(statSync((await download.path())!).size).toBe(MB);
  });

  await test.step('a student submission over 500KB is still refused (submissions stay inline)', async () => {
    await page.locator('input[type="file"]').setInputFiles({ name: 'work-600kb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(600 * 1024) });
    await expect(page.getByText('File must be 500KB or smaller.')).toBeVisible();
    expect(await newKeys(), 'a student upload must never reach the Realtime Database').toHaveLength(1);
  });

  await test.step('the teacher removes the attachment: the file and the counters go', async () => {
    await page.context().clearCookies();
    await loginAs(page, 'teacher');
    await page.goto(ASSIGNMENTS_HREF);
    await aRow.getByRole('button', { name: 'Edit assignment' }).click();
    await expect(page.getByText('Current file').or(page.getByText('assignment-1mb.pdf'))).toBeVisible();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Edit assignment' })).toHaveCount(0, { timeout: 120_000 });
    await expect.poll(async () => (await db().collection('institutions').doc(iid).collection('assignments').doc(createdAssignmentIds[0]).get()).data()?.attachmentBlobKey, { timeout: 20_000 }).toBeUndefined();
    await expect.poll(newKeys, { timeout: 20_000 }).toEqual([]);
    await expectCounters(0);
  });
});

test('assignment: replacing with a small file stores it inline; an admin deleting the assignment removes a large file', async ({ page, context }) => {
  test.setTimeout(480_000);
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(ASSIGNMENTS_HREF);
  const aRow = assignmentRow(page).row;

  await test.step('small file: embedded, no Realtime Database use', async () => {
    await aRow.getByRole('button', { name: 'Edit assignment' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'small-100kb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(100 * 1024) });
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Edit assignment' })).toHaveCount(0, { timeout: 60_000 });
    const a = (await db().collection('institutions').doc(iid).collection('assignments').doc(createdAssignmentIds[0]).get()).data()!;
    expect(typeof a.attachmentDataUrl).toBe('string');
    expect(a.attachmentBlobKey).toBeUndefined();
    expect(await newKeys()).toEqual([]);
    await expectCounters(0);
  });

  await test.step('large file again, then the admin deletes the assignment', async () => {
    await aRow.getByRole('button', { name: 'Edit assignment' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'large-900kb.pdf', mimeType: 'application/pdf', buffer: pdfBuffer(900 * 1024) });
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Edit assignment' })).toHaveCount(0, { timeout: 120_000 });
    const a = (await db().collection('institutions').doc(iid).collection('assignments').doc(createdAssignmentIds[0]).get()).data()!;
    expect(typeof a.attachmentBlobKey).toBe('string');
    expect(a.attachmentDataUrl, 'the inline body must be cleared when a key is stored').toBeUndefined();
    await expectCounters(900 * 1024);

    await page.context().clearCookies();
    await loginAs(page, 'admin');
    await page.goto(ASSIGNMENTS_HREF);
    await assignmentRow(page).row.getByRole('button', { name: 'Delete assignment' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => (await db().collection('institutions').doc(iid).collection('assignments').doc(createdAssignmentIds[0]).get()).exists, { timeout: 20_000 }).toBe(false);
    await expect.poll(newKeys, { timeout: 20_000 }).toEqual([]);
    await expectCounters(0);
  });
});

// ── The sweep, limited to the QA institution ────────────────────────────────

function runSweep(extra: string[]): string {
  return execFileSync(
    process.execPath,
    ['scripts/sweep-orphan-blobs.mjs', '--key=scripts/service-account.json', `--project=${PROJECT_ID}`, `--institution=${iid}`, ...extra],
    { encoding: 'utf8' },
  );
}

test('sweep: an old unreferenced file is deleted, a recent one and a referenced one are kept, and the counters are corrected', async () => {
  test.setTimeout(240_000);
  const classId = (await classIdByName(CLASS_A_NAME))!;
  const subjectId = (await subjectIdByName(SUBJECT_NAME))!;
  const noteId = await seedNote({ name: SEEDED_NOTE, teacher, teacherRole: 'regular_teacher', classId, className: CLASS_A_NAME, subjectId, subjectName: SUBJECT_NAME, links: [{ url: 'https://example.com/seeded' }] });
  seededNoteIds.push(noteId);

  const referenced = await seedBlob(iid, { ageDays: 30, size: 1000 });
  const agedOrphan = await seedBlob(iid, { ageDays: 8, size: 1000 });
  const recentOrphan = await seedBlob(iid, { ageDays: 1, size: 1000 });
  seededKeys.push(referenced, agedOrphan, recentOrphan);

  const noteRef = db().collection('institutions').doc(iid).collection('lessonNotes').doc(noteId);
  await noteRef.update({ hasAttachment: true, attachmentFileName: 'seed.pdf', attachmentMimeType: 'application/pdf', attachmentSize: 1000 });
  await noteRef.collection('attachment').doc('data').set({ blobKey: referenced, fileName: 'seed.pdf', mimeType: 'application/pdf', size: 1000 });

  // Drift both counters by the same amount, as a missed delete would.
  const drift = 777;
  const now = await counters(iid);
  await rtdb().ref().update({ [`usage/institutions/${iid}/bytes`]: now.institution + drift, 'usage/total/bytes': now.total + drift });

  await test.step('a dry run reports and changes nothing', async () => {
    const out = runSweep([]);
    expect(out).toContain(`Scope: institution ${iid} only`);
    expect(out).toMatch(/Referenced \(kept\):\s+1\b/);
    expect(out).toMatch(/Recent, unreferenced \(kept\):\s+1\b/);
    expect(out).toMatch(/ORPHANS \(older than the grace\):\s+1\b/);
    expect(out).toContain('Dry run: nothing was changed');
    for (const k of [referenced, agedOrphan, recentOrphan]) expect(await blobExists(iid, k)).toBe(true);
    expect(out, 'a full key must never be printed').not.toContain(agedOrphan);
  });

  await test.step('--apply deletes only the old orphan and corrects the counters', async () => {
    const out = runSweep(['--apply']);
    expect(out).toContain('Deleted 1 orphan file(s).');
    expect(await blobExists(iid, agedOrphan)).toBe(false);
    expect(await blobExists(iid, referenced)).toBe(true);
    expect(await blobExists(iid, recentOrphan)).toBe(true);
    // baseline + the two files that remain (2000); the drift and the deleted file are gone
    await expectCounters(2000);
  });

  await test.step('a second run finds nothing to do', async () => {
    const out = runSweep([]);
    expect(out).toMatch(/ORPHANS \(older than the grace\):\s+0\b/);
    expect(out).toContain('Counters: all match the files that remain.');
  });

  // cleanup of the seeds is done in afterAll (notes, files, counters)
});

// ── Spectator ───────────────────────────────────────────────────────────────

test('spectator: sees a large-file note and downloads it, with no create, edit or delete controls', async ({ page, context }) => {
  test.skip(!CREDS.spectator.email || !CREDS.spectator.password, 'QA_SPECTATOR_EMAIL / QA_SPECTATOR_PASSWORD are not in .env.qa: create a spectator in the QA institution and add them');
  test.setTimeout(240_000);
  await forceLiveData(context);
  await loginAs(page, 'spectator');
  await page.goto(LESSONS_HREF);
  await expect(page.getByRole('heading', { name: 'Lesson Notes', level: 1 })).toBeVisible();
  await expect(row(page, SEEDED_NOTE)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Add new lesson note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete lesson note' })).toHaveCount(0);
  await row(page, SEEDED_NOTE).getByRole('button', { name: `View ${SEEDED_NOTE}` }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('seed.pdf');
});
