import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { forceLiveData, login, dismissTourIfPresent } from './helpers';
import {
  HAS_ADMIN_SDK,
  NOTE_PREFIX,
  allNames,
  attachmentDoc,
  classIdByName,
  expectAllowed,
  expectDenied,
  institutionId,
  linkParentToStudent,
  noteByName,
  openProbe,
  persistCredential,
  seedNote,
  subjectIdByName,
  sweepQaNotes,
  taughtNames,
  userByEmail,
  type Probe,
  type UserInfo,
} from './lesson-notes-support';

// LESSON_NOTES_FEATURE_SPEC.md §10 QA pass, driven against the live "Example
// School" QA institution like specs 01-08. It reuses 08's fixtures (QA
// Assignments Class / Class B, the fixture student + parent, a second
// senior_teacher) and adds its own: a regular teacher IN Example Department
// (a dedicated, known-good author for the senior_teacher department-matching
// cases), a subject that teacher teaches, a Class B student, and a second
// parent link. (This was first written on the belief that the pre-existing
// QA_TEACHER had no departmentId; that came from a stale users doc in an older
// demo institution sharing its email — the real account does have one. The dedicated
// teacher is kept because it makes these cases independent of that account.)
// Fixtures are additive and left in place, as in
// 00-08; every note this spec creates is named with NOTE_PREFIX and swept at
// the end — nothing else in the institution is touched.
//
// Two layers: UI tests (a real browser per role) and rule probes (the
// Firebase web SDK in Node, signed in as each QA account) — the browser can't
// issue a raw forbidden read/write, which is exactly what the rules exist to
// stop. Every probe denial is paired with a positive control, and expectDenied
// requires specifically `permission-denied`, so a failure caused by something
// else (e.g. App Check enforcement) can't masquerade as a passing denial.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const CREDS = {
  admin: { email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD },
  senior: { email: process.env.QA_SENIOR_TEACHER_EMAIL, password: process.env.QA_SENIOR_TEACHER_PASSWORD },
  senior2: {
    email: process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_EMAIL,
    password: process.env.QA_ASSIGNMENTS_SENIOR_TEACHER_2_PASSWORD,
  },
  studentA: { email: process.env.QA_ASSIGNMENTS_STUDENT_EMAIL, password: process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD },
  parent: { email: process.env.QA_ASSIGNMENTS_PARENT_EMAIL, password: process.env.QA_ASSIGNMENTS_PARENT_PASSWORD },
  superadmin: { email: process.env.QA_SUPERADMIN_EMAIL, password: process.env.QA_SUPERADMIN_PASSWORD },
};
// Fixture accounts this spec creates itself (credentials persisted to .env.qa).
type FixtureWho = 'teacher' | 'studentB';
type Who = keyof typeof CREDS | FixtureWho;

const CLASS_A_NAME = 'QA Assignments Class';
const CLASS_B_NAME = 'QA Assignments Class B';
const SUBJECT_NAME = 'QA Lessons Subject';
const DEPARTMENT_NAME = 'Example Department';

// AdminCreateUserForm pre-fills a per-role default password when the role is
// selected (ROLE_DEFAULT_PASSWORDS), overwriting anything typed beforehand —
// so these accounts use that default rather than a password of our choosing.
const FIXTURES: Record<FixtureWho, { name: string; email: string; envPrefix: string; password: string }> = {
  teacher: {
    name: 'QaLessons Teacher',
    email: 'qa.lessons.teacher@demo.com',
    envPrefix: 'QA_LESSONS_TEACHER',
    password: 'Teacher0123456789',
  },
  studentB: {
    name: 'QaLessons StudentB',
    email: 'qa.lessons.studentb@demo.com',
    envPrefix: 'QA_LESSONS_STUDENT_B',
    password: 'Student01234567890',
  },
};

const LESSONS_HREF = '/dashboard/list/lesson-notes';
const PDF_PATH = 'e2e/.fixtures/qa-submission.pdf';
const PDF_BYTES = readFileSync(PDF_PATH);
const PDF_DATA_URL = `data:application/pdf;base64,${PDF_BYTES.toString('base64')}`;

// Names of the notes seeded through the Admin SDK (rules-shaped), plus the
// ones the UI tests create themselves.
const N = {
  classA: `${NOTE_PREFIX} Teacher Class A`,
  subjectOnly: `${NOTE_PREFIX} Subject Only`,
  classB: `${NOTE_PREFIX} Teacher Class B`,
  seniorOwn: `${NOTE_PREFIX} Senior Own`,
  badLink: `${NOTE_PREFIX} Bad Link`,
  deleteTarget: `${NOTE_PREFIX} Delete Target`,
  seniorEdit: `${NOTE_PREFIX} Senior Edit Target`,
  uiCreated: `${NOTE_PREFIX} UI Created`,
  adminNote: `${NOTE_PREFIX} Admin Note`,
};

type Ctx = {
  iid: string;
  classA: string;
  classB: string;
  subject: string;
  admin: UserInfo;
  teacher: UserInfo;
  senior: UserInfo;
  senior2: UserInfo;
  studentA: UserInfo;
  studentB: UserInfo;
  parent: UserInfo;
  ids: Record<keyof typeof N, string>;
};
const ctx = {} as Ctx;

function need(who: Who): { email: string; password: string } {
  if (who === 'teacher' || who === 'studentB') {
    const f = FIXTURES[who];
    return { email: f.email, password: process.env[`${f.envPrefix}_PASSWORD`] ?? f.password };
  }
  const c = CREDS[who];
  if (!c.email || !c.password) throw new Error(`QA credentials for ${who} are missing from .env.qa`);
  return { email: c.email, password: c.password };
}

// Defensive re-check for a fresh account's first login — see
// 08-assignments-workflow.spec.ts's ensurePastChangePassword.
async function ensurePastChangePassword(page: Page, password: string) {
  if (!page.url().includes('/change-password')) return;
  await page.getByLabel('New Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm New Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set Password & Continue' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

async function loginAs(page: Page, who: Who): Promise<void> {
  const c = need(who);
  await login(page, {
    institutionLabel: who === 'superadmin' ? 'Platform Administration' : INSTITUTION_NAME!,
    email: c.email,
    password: c.password,
  });
  await ensurePastChangePassword(page, c.password);
  // A brand-new fixture account's very first login can bounce back to
  // /change-password once more, a moment after the first change (the app's
  // mustChangePassword write races its own redirect — see 08's
  // ensurePastChangePassword). Give it time to settle, re-checking, rather than
  // asserting on whatever page happens to be showing. A no-op once the
  // account has been through it (later runs land straight on /dashboard).
  if (who === 'teacher' || who === 'studentB') {
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(2_500);
      if (!page.url().includes('/change-password')) break;
      await ensurePastChangePassword(page, c.password);
    }
    await expect(page).toHaveURL(/\/dashboard/);
  }
  // Only institution_admin gets an auto-started product tour whose overlay
  // intercepts clicks (App.tsx ROLES_WITH_REAL_TOURS).
  if (who === 'admin') await dismissTourIfPresent(page);
}

// Opens the page through the sidebar item, so the nav entry itself is under test.
async function openLessonsViaSidebar(page: Page) {
  await page.getByRole('link', { name: 'Lessons', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${LESSONS_HREF}$`));
}

const row = (page: Page, name: string) => page.locator('tr', { hasText: name }).first();

// The dashboard's Quick Actions panel. Scoped explicitly because the sidebar
// has same-named links ("Assignments", "Results", "Lessons"), which would
// otherwise make every card locator ambiguous.
const quickActions = (page: Page) =>
  page.getByRole('heading', { name: 'Quick Actions' }).locator('xpath=..');

async function expectRowVisible(page: Page, name: string) {
  await expect(row(page, name)).toBeVisible({ timeout: 15_000 });
}
async function expectRowAbsent(page: Page, name: string) {
  // List listeners settle asynchronously — give a visible sibling time to
  // render first (callers assert one present row before calling this), then
  // require the absent one to stay absent.
  await expect(page.locator('tr', { hasText: name })).toHaveCount(0, { timeout: 5_000 });
}

async function expectNoWriteControls(page: Page) {
  await expect(page.getByRole('button', { name: 'Add new lesson note' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete lesson note' })).toHaveCount(0);
}

async function selectOptionTexts(page: Page, selector: string): Promise<string[]> {
  const texts = await page.locator(`${selector} option`).allTextContents();
  return texts.map((t) => t.trim()).filter((t) => t && t !== 'None').sort();
}

// ── Setup ───────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required (ground-truth checks, seeding, cleanup)');
  test.skip(!INSTITUTION_NAME, 'QA_INSTITUTION_NAME missing from .env.qa');
});

test.afterAll(async () => {
  if (!HAS_ADMIN_SDK || !INSTITUTION_NAME) return;
  await sweepQaNotes();
});

async function userExists(email: string): Promise<boolean> {
  try {
    await userByEmail(email);
    return true;
  } catch {
    return false;
  }
}

// Same /dashboard/create-user flow 08-assignments-workflow.spec.ts drives.
async function createUserViaForm(
  page: Page,
  opts: { name: string; email: string; password: string; roleLabel: 'Regular Teacher' | 'Student'; className?: string; department?: string },
) {
  const [firstName, lastName] = opts.name.split(' ');
  await page.goto('/dashboard/create-user');
  await dismissTourIfPresent(page);
  await page.locator('#tour-create-user-first-name').fill(firstName);
  await page.locator('#tour-create-user-last-name').fill(lastName);
  await page.locator('#tour-create-user-email').fill(opts.email);
  // Role first: selecting it pre-fills the role's default password, so the
  // password fields are set (explicitly, to the same value) only afterwards.
  await page.locator('#tour-create-user-role').selectOption({ label: opts.roleLabel });
  await page.locator('#tour-create-user-password').fill(opts.password);
  await page.locator('#tour-create-user-confirm-password').fill(opts.password);
  if (opts.roleLabel === 'Student') {
    await page.locator('#tour-create-user-class').selectOption({ label: opts.className! });
    await page.locator('#tour-create-user-dob').fill('2010-01-15');
    await page.locator('#tour-create-user-gender').selectOption({ label: 'Female' });
  }
  if (opts.department) {
    await page.locator('#tour-create-user-department').selectOption({ label: opts.department });
  }
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(`${opts.name} was created successfully.`)).toBeVisible({ timeout: 15_000 });
}

// Mirrors 08's ensureSubjectExists: a hard reload first, because the form's
// teacher and class checklists read 60s-cached reference queries that won't
// include accounts/classes created moments earlier.
async function createLessonsSubject(page: Page, teacherName: string) {
  await page.goto('/dashboard/list/subjects');
  await dismissTourIfPresent(page);
  await page.reload();
  await dismissTourIfPresent(page);
  await page.getByRole('button', { name: 'Add new subject' }).click();
  await page.locator('input[name="name"]').fill(SUBJECT_NAME);
  await page.getByText('Specific Class(es)').click();
  await page.getByLabel(CLASS_A_NAME, { exact: true }).check();
  await page.getByLabel(CLASS_B_NAME, { exact: true }).check();
  await page.getByLabel(teacherName, { exact: true }).check();
  // Attendance Frequency defaults to Weekly with no day pre-checked.
  await page.getByLabel('Mon', { exact: true }).check();
  await page.getByLabel('Wed', { exact: true }).check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(SUBJECT_NAME, { exact: true })).toBeVisible({ timeout: 15_000 });
}

test('fixtures: QA teacher in a department, their subject, Class B student, two-child parent, seeded notes', async ({ page, context }) => {
  ctx.iid = await institutionId();

  const classA = await classIdByName(CLASS_A_NAME);
  const classB = await classIdByName(CLASS_B_NAME);
  if (!classA || !classB) {
    throw new Error(
      'The QA Assignments classes are missing. Run ' +
        '`npx playwright test e2e/08-assignments-workflow.spec.ts -g fixtures` first.',
    );
  }
  ctx.classA = classA;
  ctx.classB = classB;

  ctx.admin = await userByEmail(need('admin').email);
  ctx.senior = await userByEmail(need('senior').email);
  ctx.senior2 = await userByEmail(need('senior2').email);
  ctx.studentA = await userByEmail(need('studentA').email);
  ctx.parent = await userByEmail(need('parent').email);

  // Create whatever is missing, through the app's own forms, in one admin session.
  const needTeacher = !(await userExists(FIXTURES.teacher.email));
  const needStudentB = !(await userExists(FIXTURES.studentB.email));
  const needSubject = !(await subjectIdByName(SUBJECT_NAME));
  if (needTeacher || needStudentB || needSubject) {
    await forceLiveData(context);
    await loginAs(page, 'admin');
    if (needTeacher) {
      await createUserViaForm(page, {
        name: FIXTURES.teacher.name,
        email: FIXTURES.teacher.email,
        password: FIXTURES.teacher.password,
        roleLabel: 'Regular Teacher',
        department: DEPARTMENT_NAME,
      });
    }
    if (needStudentB) {
      await createUserViaForm(page, {
        name: FIXTURES.studentB.name,
        email: FIXTURES.studentB.email,
        password: FIXTURES.studentB.password,
        roleLabel: 'Student',
        className: CLASS_B_NAME,
      });
    }
    if (needSubject) await createLessonsSubject(page, FIXTURES.teacher.name);
  }
  // Unconditional (idempotent) so a stale value from an earlier run is corrected.
  for (const f of Object.values(FIXTURES)) {
    persistCredential(`${f.envPrefix}_EMAIL`, f.email);
    persistCredential(`${f.envPrefix}_PASSWORD`, f.password);
  }

  ctx.teacher = await userByEmail(FIXTURES.teacher.email);
  ctx.studentB = await userByEmail(FIXTURES.studentB.email);
  ctx.subject = (await subjectIdByName(SUBJECT_NAME))!;
  expect(ctx.subject, 'QA Lessons Subject should exist').toBeTruthy();

  // The narrow senior_teacher rule keys off departmentId. Fail loudly with
  // the cause rather than letting every senior-teacher case fail confusingly.
  for (const u of [ctx.teacher, ctx.senior, ctx.senior2]) {
    expect(u.departmentId, `${u.name} must have a departmentId on their users doc`).toBeTruthy();
  }
  expect(ctx.senior.departmentId, 'the senior_teacher must share the regular teacher\'s department').toBe(ctx.teacher.departmentId);
  expect(ctx.senior2.departmentId, 'the second senior_teacher must share the department too').toBe(ctx.teacher.departmentId);
  expect(ctx.studentB.classId, 'Student B must be in Class B').toBe(ctx.classB);
  const taught = await taughtNames(ctx.teacher.uid);
  expect(taught.subjects, 'the QA teacher must teach the QA subject').toContain(SUBJECT_NAME);
  expect(taught.classes).toEqual(expect.arrayContaining([CLASS_A_NAME, CLASS_B_NAME]));

  // The parent gets a second child, in a different class.
  await linkParentToStudent(ctx.parent.uid, ctx.studentB.uid, ctx.admin.uid);

  // Clean slate, then seed.
  await sweepQaNotes();
  const attachment = { fileName: 'qa-submission.pdf', mimeType: 'application/pdf', dataUrl: PDF_DATA_URL, size: PDF_BYTES.length };
  const link = { url: 'https://example.com/lesson', label: 'Example lesson' };
  const seed = (key: keyof typeof N, n: Parameters<typeof seedNote>[0]) =>
    seedNote(n).then((id) => {
      ctx.ids = { ...(ctx.ids ?? {}), [key]: id } as Ctx['ids'];
    });

  await seed('classA', {
    name: N.classA, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classA, className: CLASS_A_NAME, subjectId: ctx.subject, subjectName: SUBJECT_NAME,
    links: [link], attachment,
  });
  await seed('subjectOnly', {
    name: N.subjectOnly, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    subjectId: ctx.subject, subjectName: SUBJECT_NAME, links: [link], attachment,
  });
  await seed('classB', {
    name: N.classB, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classB, className: CLASS_B_NAME, links: [link],
  });
  await seed('seniorOwn', {
    name: N.seniorOwn, teacher: ctx.senior, teacherRole: 'senior_teacher',
    classId: ctx.classA, className: CLASS_A_NAME, links: [link],
  });
  await seed('badLink', {
    name: N.badLink, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classA, className: CLASS_A_NAME,
    // A link written around the form (e.g. straight to the API) must render
    // as inert text, never a clickable anchor.
    links: [{ url: 'javascript:alert(1)', label: 'Bad link label' }, { url: 'https://example.com/ok', label: 'Good link label' }],
  });
  await seed('deleteTarget', {
    name: N.deleteTarget, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classA, className: CLASS_A_NAME, links: [link], attachment,
  });
  await seed('seniorEdit', {
    name: N.seniorEdit, teacher: ctx.teacher, teacherRole: 'regular_teacher',
    classId: ctx.classA, className: CLASS_A_NAME, links: [link], attachment,
  });
});

// ── UI: regular teacher ─────────────────────────────────────────────────────

test('regular_teacher UI: sidebar, validation, create with file + links, ground-truth in Firestore', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await expect(page.getByRole('link', { name: 'Lessons', exact: true })).toHaveCount(1);
  await openLessonsViaSidebar(page);
  await expect(page.getByRole('heading', { name: 'Lesson Notes', level: 1 })).toBeVisible();

  // Own notes only — never another author's (here, the senior's).
  await expectRowVisible(page, N.classA);
  await expectRowAbsent(page, N.seniorOwn);

  await page.getByRole('button', { name: 'Add new lesson note' }).click();
  await expect(page.locator('h1', { hasText: 'Create a new lesson note' })).toBeVisible();
  await expect(page.getByText('PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP — 5MB max.')).toBeVisible(); // teachers may attach up to 5MB (Realtime Database)

  await test.step('a note with no file and no link is blocked', async () => {
    await page.locator('input[name="name"]').fill(N.uiCreated);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('Add a file or at least one link.')).toBeVisible();
  });

  await test.step('a non-http(s) link is rejected', async () => {
    await page.getByLabel('Link 1 URL').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('Only http:// and https:// links are allowed.')).toBeVisible();
  });

  await test.step('a file over 5MB is rejected with the size message', async () => {
    const oversize = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(5 * 1024 * 1024 + 1, 0x41)]);
    await page.locator('input[type="file"]').setInputFiles({ name: 'too-big.pdf', mimeType: 'application/pdf', buffer: oversize });
    await expect(page.getByText('File must be 5MB or smaller.')).toBeVisible();
  });

  await test.step('a valid note saves', async () => {
    await page.locator('select[name="subjectId"]').selectOption({ label: SUBJECT_NAME });
    await page.locator('select[name="classId"]').selectOption({ label: CLASS_A_NAME });
    await page.getByLabel('Link 1 URL').fill('https://www.youtube.com/watch?v=qa');
    await page.getByLabel('Link 1 label').fill('Video');
    await page.getByRole('button', { name: 'Add link' }).click();
    await page.getByLabel('Link 2 URL').fill('https://example.com/article');
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);
    await expect(page.getByText('qa-submission.pdf')).toBeVisible();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Create a new lesson note' })).toHaveCount(0, { timeout: 15_000 });
    await expectRowVisible(page, N.uiCreated);
  });

  await test.step('Firestore agrees: denormalized owner fields, metadata, and the file document', async () => {
    await expect.poll(async () => (await noteByName(N.uiCreated))?.hasAttachment, { timeout: 15_000 }).toBe(true);
    const note = (await noteByName(N.uiCreated))!;
    expect(note.teacherId).toBe(ctx.teacher.uid);
    expect(note.teacherRole).toBe('regular_teacher');
    expect(note.departmentId).toBe(ctx.teacher.departmentId);
    expect(note.classId).toBe(ctx.classA);
    expect(note.subjectId).toBe(ctx.subject);
    expect(note.attachmentFileName).toBe('qa-submission.pdf');
    expect((note.resourceLinks as unknown[]).length).toBe(2);
    const att = await attachmentDoc(note.id);
    expect(att, 'attachment/data should exist').not.toBeNull();
    expect(att?.fileName).toBe('qa-submission.pdf');
    ctx.ids = { ...ctx.ids, uiCreated: note.id };
  });
});

test('regular_teacher UI: edit, replace file, download, remove file, delete', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(LESSONS_HREF);
  await expectRowVisible(page, N.uiCreated);

  await test.step('replace the file', async () => {
    await row(page, N.uiCreated).getByRole('button', { name: `Edit ${N.uiCreated}` }).click();
    await expect(page.locator('h1', { hasText: 'Edit lesson note' })).toBeVisible();
    await expect(page.getByText('Current file: qa-submission.pdf')).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'qa-replacement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 replacement body'),
    });
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Edit lesson note' })).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => (await attachmentDoc(ctx.ids.uiCreated))?.fileName, { timeout: 15_000 }).toBe('qa-replacement.pdf');
    expect((await noteByName(N.uiCreated))?.attachmentFileName).toBe('qa-replacement.pdf');
  });

  await test.step('download delivers the stored file', async () => {
    await row(page, N.uiCreated).getByRole('button', { name: `View ${N.uiCreated}` }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('qa-replacement.pdf');
    await page.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('remove the file while keeping the links', async () => {
    await row(page, N.uiCreated).getByRole('button', { name: `Edit ${N.uiCreated}` }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Edit lesson note' })).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => (await noteByName(N.uiCreated))?.hasAttachment, { timeout: 15_000 }).toBe(false);
    expect((await noteByName(N.uiCreated))?.attachmentFileName).toBeUndefined();
    expect(await attachmentDoc(ctx.ids.uiCreated), 'attachment/data should be gone').toBeNull();
  });

  await test.step('the author deletes their own note', async () => {
    await row(page, N.uiCreated).getByRole('button', { name: 'Delete lesson note' }).click();
    await expect(page.getByText('This will permanently remove this lesson note and its attached file.')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => noteByName(N.uiCreated), { timeout: 15_000 }).toBeNull();
  });
});

test('regular_teacher UI: pickers are limited to the classes and subjects they teach', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(LESSONS_HREF);
  await page.getByRole('button', { name: 'Add new lesson note' }).click();
  const taught = await taughtNames(ctx.teacher.uid);
  expect(taught.subjects, 'precondition: the QA teacher teaches the QA subject').toContain(SUBJECT_NAME);
  await expect
    .poll(() => selectOptionTexts(page, 'select[name="subjectId"]'), { timeout: 15_000 })
    .toEqual([...taught.subjects].sort());
  await expect
    .poll(() => selectOptionTexts(page, 'select[name="classId"]'), { timeout: 15_000 })
    .toEqual([...taught.classes].sort());
});

// ── UI: institution_admin ───────────────────────────────────────────────────

test('institution_admin UI: sees all notes, all pickers, creates a link-only note, deletes a note with a file', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'admin');
  await openLessonsViaSidebar(page);
  await expect(page.getByRole('heading', { name: 'Lesson Notes', level: 1 })).toBeVisible();

  await expectRowVisible(page, N.classA);
  await expectRowVisible(page, N.seniorOwn);

  await page.getByRole('button', { name: 'Add new lesson note' }).click();
  await expect
    .poll(() => selectOptionTexts(page, 'select[name="subjectId"]'), { timeout: 15_000 })
    .toEqual((await allNames('subjects')).sort());
  await expect
    .poll(() => selectOptionTexts(page, 'select[name="classId"]'), { timeout: 15_000 })
    .toEqual((await allNames('classes')).sort());

  await page.locator('input[name="name"]').fill(N.adminNote);
  await page.getByLabel('Link 1 URL').fill('https://example.com/admin');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('h1', { hasText: 'Create a new lesson note' })).toHaveCount(0, { timeout: 15_000 });
  await expectRowVisible(page, N.adminNote);
  await expect.poll(async () => (await noteByName(N.adminNote))?.teacherRole, { timeout: 15_000 }).toBe('institution_admin');
  const adminNote = (await noteByName(N.adminNote))!;
  expect(adminNote.teacherId).toBe(ctx.admin.uid);
  expect(adminNote.hasAttachment).toBe(false);

  await test.step("delete a teacher's note that has a file: the note and its file document both go", async () => {
    expect(await attachmentDoc(ctx.ids.deleteTarget), 'precondition: seeded file exists').not.toBeNull();
    await row(page, N.deleteTarget).getByRole('button', { name: 'Delete lesson note' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => noteByName(N.deleteTarget), { timeout: 15_000 }).toBeNull();
    expect(await attachmentDoc(ctx.ids.deleteTarget), 'attachment/data must be removed with the note').toBeNull();
  });
});

// ── UI: senior teachers ─────────────────────────────────────────────────────

test('senior_teacher UI: own + same-department regular_teacher notes, can replace their file; dashboard card links here', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'senior');

  await test.step('dashboard "View My Lessons" card', async () => {
    const card = quickActions(page).getByRole('link', { name: /^View My Lessons/ });
    await expect(card).toHaveAttribute('href', LESSONS_HREF);
    await card.click();
    await expect(page).toHaveURL(new RegExp(`${LESSONS_HREF}$`));
  });

  await expectRowVisible(page, N.seniorOwn);
  await expectRowVisible(page, N.classA); // the regular teacher's, same department
  await expect(row(page, N.classA).getByRole('button', { name: /^Edit / })).toBeVisible();
  await expect(row(page, N.classA).getByRole('button', { name: 'Delete lesson note' })).toBeVisible();

  await test.step("replace the file on a regular teacher's note", async () => {
    await row(page, N.seniorEdit).getByRole('button', { name: `Edit ${N.seniorEdit}` }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'qa-senior-replacement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 senior replacement'),
    });
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(page.locator('h1', { hasText: 'Edit lesson note' })).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => (await attachmentDoc(ctx.ids.seniorEdit))?.fileName, { timeout: 15_000 }).toBe('qa-senior-replacement.pdf');
    const note = (await noteByName(N.seniorEdit))!;
    expect(note.teacherId, 'ownership must not change when a senior edits').toBe(ctx.teacher.uid);
    expect(note.teacherRole).toBe('regular_teacher');
  });
});

test("senior_teacher UI: a second senior_teacher does NOT see the first senior's own note", async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'senior2');
  await openLessonsViaSidebar(page);
  await expectRowVisible(page, N.classA); // still sees the regular teacher's: not a blanket lockout
  if (await row(page, N.seniorOwn).isVisible().catch(() => false)) {
    await page.reload();
  }
  await expectRowAbsent(page, N.seniorOwn);
});

// ── UI: student, parent, super_admin ────────────────────────────────────────

test('student UI: own-class notes only, read-only, safe links, download; Quick Actions panel', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'studentA');

  await test.step('Quick Actions panel', async () => {
    await expect(page.getByRole('heading', { name: 'Quick Actions' })).toBeVisible();
    const cards: [string, string][] = [
      ['View My Lessons', LESSONS_HREF],
      ['Assignments', '/dashboard/list/assignments'],
      ['Results', '/dashboard/list/results'],
      ['My Attendance', '/dashboard/attendance/my'],
    ];
    for (const [label, href] of cards) {
      await expect(quickActions(page).getByRole('link', { name: new RegExp(`^${label}`) })).toHaveAttribute('href', href);
    }
    for (const [, href] of cards) {
      await page.goto(href);
      await expect(page, `${href} should open for a student`).toHaveURL(new RegExp(`${href}$`));
    }
    await page.goto('/dashboard');
  });

  await openLessonsViaSidebar(page);
  await expect(page.getByRole('heading', { name: 'My Lessons', level: 1 })).toBeVisible();
  await expectRowVisible(page, N.classA);
  await expectRowVisible(page, N.badLink);
  await expectRowAbsent(page, N.classB); // another class
  await expectRowAbsent(page, N.subjectOnly); // no class set
  await expectNoWriteControls(page);

  await test.step('links: http(s) opens safely in a new tab; a javascript: link is inert text', async () => {
    await row(page, N.badLink).getByRole('button', { name: `View ${N.badLink}` }).click();
    const good = page.getByRole('link', { name: 'Good link label' });
    await expect(good).toHaveAttribute('href', 'https://example.com/ok');
    await expect(good).toHaveAttribute('target', '_blank');
    await expect(good).toHaveAttribute('rel', /noopener/);
    await expect(page.getByText('Bad link label')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bad link label' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('download works for a student of the class', async () => {
    await row(page, N.classA).getByRole('button', { name: `View ${N.classA}` }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('qa-submission.pdf');
  });
});

test('student UI: a student in Class B sees only Class B notes', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'studentB');
  await openLessonsViaSidebar(page);
  await expect(page.getByRole('heading', { name: 'My Lessons', level: 1 })).toBeVisible();
  await expectRowVisible(page, N.classB);
  await expectRowAbsent(page, N.classA);
  await expectNoWriteControls(page);
});

test('parent UI: notes for every linked child\'s class; "View Lessons" card', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'parent');

  await test.step('Quick Actions panel (parent wording)', async () => {
    await expect(quickActions(page).getByRole('link', { name: /^View Lessons/ })).toHaveAttribute('href', LESSONS_HREF);
    await expect(quickActions(page).getByRole('link', { name: /^View My Lessons/ })).toHaveCount(0);
    for (const [label, href] of [
      ['Assignments', '/dashboard/list/assignments'],
      ['Results', '/dashboard/list/results'],
      ['Child Attendance', '/dashboard/attendance/child'],
    ]) {
      await expect(quickActions(page).getByRole('link', { name: new RegExp(`^${label}`) })).toHaveAttribute('href', href);
      await page.goto(href);
      await expect(page, `${href} should open for a parent`).toHaveURL(new RegExp(`${href}$`));
      await page.goto('/dashboard');
    }
  });

  await quickActions(page).getByRole('link', { name: /^View Lessons/ }).click();
  await expect(page).toHaveURL(new RegExp(`${LESSONS_HREF}$`));
  await expect(page.getByRole('heading', { name: 'Lessons', exact: true, level: 1 })).toBeVisible();
  await expectRowVisible(page, N.classA); // child 1's class
  await expectRowVisible(page, N.classB); // child 2's class
  await expectRowAbsent(page, N.subjectOnly);
  await expectNoWriteControls(page);
});

test('super_admin UI: no Lessons nav item, and the route redirects', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'superadmin');
  await expect(page.getByRole('link', { name: 'Lessons', exact: true })).toHaveCount(0);
  await page.goto(LESSONS_HREF);
  await expect(page).toHaveURL(/\/dashboard\/?$/);
});

// ── Rule probes (Firebase web SDK in Node) ──────────────────────────────────

async function withProbes(
  who: Who[],
  fn: (p: Record<string, Probe>) => Promise<void>,
): Promise<void> {
  const opened: Record<string, Probe> = {};
  try {
    for (const w of who) {
      const c = need(w);
      opened[w] = await openProbe(c.email, c.password);
    }
    await fn(opened);
  } finally {
    await Promise.all(Object.values(opened).map((p) => p.close().catch(() => undefined)));
  }
}

const noteDoc = (p: Probe, id: string) => doc(p.db, 'institutions', ctx.iid, 'lessonNotes', id);
const attDoc = (p: Probe, id: string) => doc(p.db, 'institutions', ctx.iid, 'lessonNotes', id, 'attachment', 'data');
const notesCol = (p: Probe) => collection(p.db, 'institutions', ctx.iid, 'lessonNotes');

// A rules-valid note as the regular teacher would write it; overrides inject
// one defect at a time.
function validNote(p: Probe, overrides: Record<string, unknown> = {}) {
  return {
    institutionId: ctx.iid,
    name: `${NOTE_PREFIX} Probe ${Math.random().toString(36).slice(2, 8)}`,
    classId: ctx.classA,
    className: CLASS_A_NAME,
    teacherId: p.uid,
    teacherName: ctx.teacher.name,
    teacherRole: 'regular_teacher',
    departmentId: ctx.teacher.departmentId,
    hasAttachment: false,
    resourceLinks: [{ url: 'https://example.com/probe' }],
    createdBy: p.uid,
    createdByRole: 'regular_teacher',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}
const goodFile = { dataUrl: PDF_DATA_URL, fileName: 'probe.pdf', mimeType: 'application/pdf', size: PDF_BYTES.length };

test('rules: read access by role, query shape, and attachment reads', async () => {
  await withProbes(['teacher', 'senior', 'senior2', 'studentA', 'studentB', 'parent', 'admin'], async (p) => {
    const { classA, subjectOnly, classB, seniorOwn } = ctx.ids;

    await test.step('controls: the author, admin, and an in-class student can read', async () => {
      await expectAllowed('author reads own note', getDoc(noteDoc(p.teacher, classA)));
      await expectAllowed('admin reads the whole collection', getDocs(notesCol(p.admin)));
      await expectAllowed('student A reads a Class A note', getDoc(noteDoc(p.studentA, classA)));
    });

    await test.step('students: only their own class', async () => {
      await expectDenied('student B reads a Class A note', getDoc(noteDoc(p.studentB, classA)));
      await expectAllowed('student B reads a Class B note', getDoc(noteDoc(p.studentB, classB)));
      await expectDenied('student A reads a subject-only note (no class)', getDoc(noteDoc(p.studentA, subjectOnly)));
    });

    await test.step('parents: classed notes only — never a subject-only note', async () => {
      await expectAllowed('parent reads a classed note', getDoc(noteDoc(p.parent, classA)));
      await expectDenied('parent reads a subject-only note', getDoc(noteDoc(p.parent, subjectOnly)));
      await expectDenied('parent reads a subject-only note\'s file', getDoc(attDoc(p.parent, subjectOnly)));
      await expectAllowed('parent reads a classed note\'s file', getDoc(attDoc(p.parent, classA)));
    });

    await test.step("attachments follow the note's audience", async () => {
      await expectAllowed('student A reads a Class A file', getDoc(attDoc(p.studentA, classA)));
      await expectDenied('student B reads a Class A file', getDoc(attDoc(p.studentB, classA)));
      await expectDenied('student A reads a subject-only file', getDoc(attDoc(p.studentA, subjectOnly)));
    });

    await test.step('senior_teacher: same-department regular notes yes, another senior\'s own note no', async () => {
      await expectAllowed('senior reads their own note', getDoc(noteDoc(p.senior, seniorOwn)));
      await expectAllowed('senior reads a same-department regular teacher note', getDoc(noteDoc(p.senior, classA)));
      await expectAllowed('senior 2 reads the regular teacher note too', getDoc(noteDoc(p.senior2, classA)));
      await expectDenied("senior 2 reads senior 1's own note", getDoc(noteDoc(p.senior2, seniorOwn)));
      await expectDenied("senior 2 reads senior 1's own note's file", getDoc(attDoc(p.senior2, seniorOwn)));
    });

    await test.step('query shape: an unfiltered list is denied for every role but admin', async () => {
      await expectDenied('student lists all notes', getDocs(notesCol(p.studentA)));
      await expectDenied('parent lists all notes', getDocs(notesCol(p.parent)));
      await expectDenied('regular teacher lists all notes', getDocs(notesCol(p.teacher)));
      await expectAllowed('student lists their own class', getDocs(query(notesCol(p.studentA), where('classId', '==', ctx.classA))));
      await expectDenied("student B lists Class A's notes", getDocs(query(notesCol(p.studentB), where('classId', '==', ctx.classA))));
      await expectAllowed('parent lists both children\'s classes', getDocs(query(notesCol(p.parent), where('classId', 'in', [ctx.classA, ctx.classB]))));
      await expectAllowed('teacher lists their own notes', getDocs(query(notesCol(p.teacher), where('teacherId', '==', p.teacher.uid))));
    });
  });
});

test('rules: create validation and the note-plus-file batch', async () => {
  await withProbes(['teacher', 'senior'], async (p) => {
    const t = p.teacher;
    const created: string[] = [];

    await test.step('control: a valid note with a file, written as one batch (the getAfter() path)', async () => {
      const ref = doc(notesCol(t));
      const batch = writeBatch(t.db);
      batch.set(ref, validNote(t, { hasAttachment: true, attachmentFileName: 'probe.pdf', attachmentMimeType: 'application/pdf', attachmentSize: goodFile.size }));
      batch.set(doc(ref, 'attachment', 'data'), goodFile);
      await expectAllowed('note + file in one batch', batch.commit());
      created.push(ref.id);
    });

    const attempt = (label: string, overrides: Record<string, unknown>) =>
      expectDenied(label, setDoc(doc(notesCol(t)), validNote(t, overrides)));

    await test.step('defects are each denied', async () => {
      await attempt('teacherId of another user', { teacherId: p.senior.uid });
      await attempt('createdBy of another user', { createdBy: p.senior.uid });
      await attempt('a teacherRole other than the creator\'s own', { teacherRole: 'senior_teacher' });
      await attempt("someone else's departmentId", { departmentId: 'not-my-department' });
      await attempt('no file and no links', { resourceLinks: [], hasAttachment: false });
      await attempt('more than 10 links', { resourceLinks: Array.from({ length: 11 }, (_, i) => ({ url: `https://example.com/${i}` })) });
      await attempt('an unknown extra field', { foo: 'bar' });
      await attempt('an empty name', { name: '' });
      await attempt('an institutionId that disagrees with the path', { institutionId: 'some-other-institution' });
    });

    await test.step('cleanup', async () => {
      for (const id of created) {
        const b = writeBatch(t.db);
        b.delete(attDoc(t, id));
        b.delete(noteDoc(t, id));
        await b.commit();
      }
    });
  });
});

test('rules: update, ownership freeze, and attachment writes', async () => {
  await withProbes(['teacher', 'studentA', 'parent'], async (p) => {
    const t = p.teacher;
    const ref = doc(notesCol(t));
    await expectAllowed('control: author creates a link-only note', setDoc(ref, validNote(t)));
    const touch = (data: Record<string, unknown>) => ({ ...data, updatedAt: serverTimestamp() });

    try {
      await test.step('ownership fields are frozen', async () => {
        await expectDenied('reassign teacherId', updateDoc(ref, touch({ teacherId: ctx.senior.uid })));
        await expectDenied('change teacherRole', updateDoc(ref, touch({ teacherRole: 'senior_teacher' })));
        await expectDenied('change departmentId', updateDoc(ref, touch({ departmentId: 'another-department' })));
        await expectDenied('change createdBy', updateDoc(ref, touch({ createdBy: ctx.senior.uid })));
        await expectAllowed('control: a normal edit by the author', updateDoc(ref, touch({ name: `${NOTE_PREFIX} Probe edited` })));
      });

      await test.step('students and parents cannot write', async () => {
        await expectDenied('student edits a note', updateDoc(noteDoc(p.studentA, ref.id), touch({ name: 'x' })));
        await expectDenied('parent edits a note', updateDoc(noteDoc(p.parent, ref.id), touch({ name: 'x' })));
        await expectDenied('student writes a file', setDoc(attDoc(p.studentA, ref.id), goodFile));
      });

      await test.step('a file needs hasAttachment, a valid data URL, and the right author', async () => {
        await expectDenied('file for a note whose hasAttachment is false', setDoc(attDoc(t, ref.id), goodFile));
        const attach = writeBatch(t.db);
        attach.update(ref, touch({ hasAttachment: true, attachmentFileName: 'probe.pdf', attachmentMimeType: 'application/pdf', attachmentSize: goodFile.size }));
        attach.set(attDoc(t, ref.id), goodFile);
        await expectAllowed('control: flip hasAttachment and write the file in one batch', attach.commit());
        await expectDenied(
          'a file with a disallowed MIME type',
          setDoc(attDoc(t, ref.id), { ...goodFile, dataUrl: 'data:text/html;base64,PGgxPmhpPC9oMT4=', mimeType: 'text/html' }),
        );
        await expectDenied('a file with an extra field', setDoc(attDoc(t, ref.id), { ...goodFile, foo: 'bar' }));
        await expectAllowed('control: replacing the file with a valid one', setDoc(attDoc(t, ref.id), goodFile));
      });
    } finally {
      const b = writeBatch(t.db);
      b.delete(attDoc(t, ref.id));
      b.delete(noteDoc(t, ref.id));
      await b.commit().catch(() => undefined);
    }
  });
});

test('rules: delete — author, narrow senior_teacher, and denials', async () => {
  await withProbes(['teacher', 'senior', 'senior2', 'studentA', 'parent'], async (p) => {
    const t = p.teacher;
    const makeNote = async () => {
      const ref = doc(notesCol(t));
      const b = writeBatch(t.db);
      b.set(ref, validNote(t, { hasAttachment: true, attachmentFileName: 'probe.pdf', attachmentMimeType: 'application/pdf', attachmentSize: goodFile.size }));
      b.set(doc(ref, 'attachment', 'data'), goodFile);
      await expectAllowed('control: create a note to delete', b.commit());
      return ref;
    };
    const batchDelete = (probe: Probe, id: string) => {
      const b = writeBatch(probe.db);
      b.delete(attDoc(probe, id));
      b.delete(noteDoc(probe, id));
      return b.commit();
    };

    const first = await makeNote();
    await test.step('students and parents cannot delete', async () => {
      await expectDenied('student deletes', deleteDoc(noteDoc(p.studentA, first.id)));
      await expectDenied('parent deletes', deleteDoc(noteDoc(p.parent, first.id)));
    });

    await test.step("a senior_teacher in the department can delete a regular teacher's note (and its file) in one batch", async () => {
      await expectAllowed('senior deletes the regular teacher note + file', batchDelete(p.senior, first.id));
      expect(await attachmentDoc(first.id), 'attachment/data should be gone').toBeNull();
    });

    await test.step('the author can delete their own note', async () => {
      const second = await makeNote();
      await expectAllowed('author deletes own note + file', batchDelete(t, second.id));
      expect(await attachmentDoc(second.id)).toBeNull();
    });

    await test.step("a senior_teacher cannot delete another senior's own note", async () => {
      await expectDenied("senior 2 deletes senior 1's note", deleteDoc(noteDoc(p.senior2, ctx.ids.seniorOwn)));
    });
  });
});
