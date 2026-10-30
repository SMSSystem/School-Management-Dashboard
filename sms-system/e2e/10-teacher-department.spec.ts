import { test, expect, type Page } from '@playwright/test';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { forceLiveData, login, dismissTourIfPresent } from './helpers';
import { TERM_NAME, qaEmail } from './qa-names';
import {
  HAS_ADMIN_SDK,
  classIdByName,
  db,
  deleteDocsByTeacherAndSubject,
  docsByTeacherAndSubject,
  ensureNoDepartmentTeacher,
  expectAllowed,
  NO_DEPT_TEACHER,
  expectDenied,
  institutionId,
  openProbe,
  subjectIdByName,
  userByEmail,
  type UserInfo,
} from './lesson-notes-support';

// ISSUES_AND_GAPS.md #38 — teachers with no department are invisible to
// senior_teachers, so a department is now required (where the institution has
// departments), warned about, and no longer self-editable.
//
// Two accounts are used:
//   - "QaNoDept Teacher" has NO departmentId, which is exactly the state under
//     test. It is created once by ensureNoDepartmentTeacher() (the admin forms
//     can no longer produce such an account) and is never given a department,
//     so it stays a stable fixture.
//   - "QaLessons Teacher" (created by 09-lesson-notes.spec.ts) has one.
// Run 09 first so that account, its subject and the QA classes exist.
//
// Note: the pre-existing QA_TEACHER does have a department. A stale users doc
// ("Ray White", same email, in an older demo institution, no login account)
// once made it look as if it did not — see userByEmail() in
// lesson-notes-support.ts.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const CLASS_A_NAME = 'QA Assignments Class';
const SUBJECT_NAME = 'QA Lessons Subject';
const DEPT_TEACHER_EMAIL = qaEmail('lessons.teacher');
// AdminCreateUserForm's per-role default password (see 09's FIXTURES).
const DEPT_TEACHER_DEFAULT_PASSWORD = 'Teacher0123456789';

const deptTeacherPassword = () => process.env.QA_LESSONS_TEACHER_PASSWORD ?? DEPT_TEACHER_DEFAULT_PASSWORD;

type Ctx = {
  iid: string;
  classA: string;
  subject: string;
  noDeptTeacher: UserInfo;
  deptTeacher: UserInfo;
};
const ctx = {} as Ctx;

async function loginAs(page: Page, who: 'admin' | 'noDeptTeacher' | 'deptTeacher') {
  const creds =
    who === 'admin'
      ? { email: process.env.QA_ADMIN_EMAIL!, password: process.env.QA_ADMIN_PASSWORD! }
      : who === 'noDeptTeacher'
        ? { email: NO_DEPT_TEACHER.email, password: NO_DEPT_TEACHER.password }
        : { email: DEPT_TEACHER_EMAIL, password: deptTeacherPassword() };
  await login(page, { institutionLabel: INSTITUTION_NAME!, ...creds });
  if (who === 'admin') await dismissTourIfPresent(page);
}

const isoDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required');
  test.skip(!INSTITUTION_NAME, 'QA_INSTITUTION_NAME missing from .env.qa');
  ctx.iid = await institutionId();

  const classA = await classIdByName(CLASS_A_NAME);
  const subject = await subjectIdByName(SUBJECT_NAME);
  if (!classA || !subject) {
    throw new Error('QA classes/subject are missing. Run `npx playwright test e2e/09-lesson-notes.spec.ts` first.');
  }
  ctx.classA = classA;
  ctx.subject = subject;
  ctx.noDeptTeacher = await ensureNoDepartmentTeacher();
  ctx.deptTeacher = await userByEmail(DEPT_TEACHER_EMAIL);

  expect(ctx.deptTeacher.departmentId, 'QaLessons Teacher must have a department (created by spec 09)').toBeTruthy();
  expect(ctx.noDeptTeacher.departmentId, 'QaNoDept Teacher must stay department-less').toBeFalsy();

  await deleteDocsByTeacherAndSubject('exams', ctx.deptTeacher.uid, ctx.subject);
  await deleteDocsByTeacherAndSubject('assignments', ctx.deptTeacher.uid, ctx.subject);
});

test.afterAll(async () => {
  if (!HAS_ADMIN_SDK || !INSTITUTION_NAME || !ctx.subject || !ctx.deptTeacher) return;
  await deleteDocsByTeacherAndSubject('exams', ctx.deptTeacher.uid, ctx.subject);
  await deleteDocsByTeacherAndSubject('assignments', ctx.deptTeacher.uid, ctx.subject);
});

// ── Warnings ────────────────────────────────────────────────────────────────

test('a teacher with no department sees the dashboard banner and a notice in the lesson-note form (warn-only)', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'noDeptTeacher');

  await expect(page.getByRole('status').filter({ hasText: 'You have no department' })).toBeVisible({ timeout: 15_000 });

  await page.goto('/dashboard/list/lesson-notes');
  await page.getByRole('button', { name: 'Add new lesson note' }).click();
  await expect(page.locator('h1', { hasText: 'Create a new lesson note' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'You have no department' })).toBeVisible();
  // Warn-only: the form is still fully usable.
  await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeEnabled();
});

test('a teacher WITH a department sees no warning', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'deptTeacher');
  // Settle: the notice appears only after the department read and the departments list resolve.
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3_000);
  await expect(page.getByRole('status').filter({ hasText: 'You have no department' })).toHaveCount(0);
});

test('admin: the Teachers list flags a department-less teacher, and only them', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'admin');
  await page.goto('/dashboard/list/teachers');

  const search = page.getByPlaceholder('Search by name…');

  await search.fill(ctx.noDeptTeacher.name);
  const noDeptRow = page.locator('tr', { hasText: ctx.noDeptTeacher.name }).first();
  await expect(noDeptRow).toBeVisible({ timeout: 15_000 });
  // The badge needs the departments list as well as the users list, so it can
  // appear a moment after the row does.
  await expect(noDeptRow.getByText('No department', { exact: true })).toBeVisible({ timeout: 15_000 });

  await test.step('the detail page explains the consequence', async () => {
    await noDeptRow.getByRole('link').first().click();
    await expect(page.getByText("No department — senior teachers can't see this teacher's notes or assignments.")).toBeVisible({ timeout: 15_000 });
    await page.goBack();
  });

  await search.fill(ctx.deptTeacher.name);
  const deptRow = page.locator('tr', { hasText: ctx.deptTeacher.name }).first();
  await expect(deptRow).toBeVisible({ timeout: 15_000 });
  await expect(deptRow.getByText('No department', { exact: true })).toHaveCount(0);
});

// ── Required department in the admin forms ──────────────────────────────────

test('admin: creating a teacher without a department is blocked (nothing is created)', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'admin');
  const email = 'qa.dept.blocked@demo.com';

  await page.goto('/dashboard/create-user');
  await dismissTourIfPresent(page);
  await page.locator('#tour-create-user-first-name').fill('QaDept');
  await page.locator('#tour-create-user-last-name').fill('Blocked');
  await page.locator('#tour-create-user-email').fill(email);
  // Role first: selecting it pre-fills that role's default password.
  await page.locator('#tour-create-user-role').selectOption({ label: 'Regular Teacher' });
  const department = page.locator('#tour-create-user-department');
  await expect(department).toBeVisible({ timeout: 15_000 });
  await expect(department).toHaveValue(''); // nothing selected
  await expect(page.getByText('(required)')).toBeVisible();

  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText('Select a department.')).toBeVisible();
  await expect(page.getByText('QaDept Blocked was created successfully.')).toHaveCount(0);

  const snap = await db().collection('users').where('email', '==', email).limit(1).get();
  expect(snap.empty, 'no account may be created without a department').toBe(true);
});

test("admin: the edit-teacher form won't let a department be cleared", async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'admin');
  await page.goto('/dashboard/list/teachers');

  await page.getByPlaceholder('Search by name…').fill(ctx.deptTeacher.name);
  const row = page.locator('tr', { hasText: ctx.deptTeacher.name }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: `Edit ${ctx.deptTeacher.name}` }).click();

  const department = page.locator('select[name="departmentId"]');
  await expect(department).toHaveValue(ctx.deptTeacher.departmentId!, { timeout: 15_000 });
  await department.selectOption('');
  await page.getByRole('button', { name: 'Update', exact: true }).click();

  await expect(page.getByText('Select a department.')).toBeVisible();
  await expect(department).toBeVisible(); // modal stayed open

  const after = await userByEmail(DEPT_TEACHER_EMAIL);
  expect(after.departmentId, 'the department must be unchanged').toBe(ctx.deptTeacher.departmentId);
});

// ── A teacher author's own department is now stamped onto their documents ──

test("an exam created by a teacher is stamped with that teacher's own department", async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'deptTeacher');
  await page.goto('/dashboard/list/exams');
  await page.getByRole('button', { name: 'Add new exam' }).click();

  await page.locator('select[name="termId"]').selectOption({ label: TERM_NAME });
  await page.locator('select[name="subjectId"]').selectOption({ label: SUBJECT_NAME });
  await page.locator('select[name="classId"]').selectOption({ label: CLASS_A_NAME });
  await page.locator('input[name="date"]').fill(isoDate(3));
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect
    .poll(async () => (await docsByTeacherAndSubject('exams', ctx.deptTeacher.uid, ctx.subject)).length, { timeout: 20_000 })
    .toBe(1);
  const [exam] = await docsByTeacherAndSubject('exams', ctx.deptTeacher.uid, ctx.subject);
  expect(exam.departmentId, "the teacher's own department must be stamped on their exam").toBe(ctx.deptTeacher.departmentId);
});

test("an assignment created by a teacher is stamped with that teacher's own department and role", async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'deptTeacher');
  await page.goto('/dashboard/list/assignments');
  await page.getByRole('button', { name: 'Add new assignment' }).click();
  await expect(page.locator('input[name="title"]')).toBeVisible({ timeout: 10_000 });

  await page.locator('input[name="title"]').fill('QA Department Stamp Assignment');
  await page.locator('select[name="termId"]').selectOption({ label: TERM_NAME });
  await page.locator('select[name="subjectId"]').selectOption({ label: SUBJECT_NAME });
  await page.locator('select[name="classId"]').selectOption({ label: CLASS_A_NAME });
  await page.locator('input[name="dueDate"]').fill(isoDate(4));
  await page.locator('select[name="gradingMode"]').selectOption({ label: 'Standalone (not in Gradebook)' });
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect
    .poll(async () => (await docsByTeacherAndSubject('assignments', ctx.deptTeacher.uid, ctx.subject)).length, { timeout: 20_000 })
    .toBe(1);
  const [assignment] = await docsByTeacherAndSubject('assignments', ctx.deptTeacher.uid, ctx.subject);
  expect(assignment.departmentId, "the teacher's own department must be stamped on their assignment").toBe(ctx.deptTeacher.departmentId);
  expect(assignment.teacherRole).toBe('regular_teacher');
});

// ── Rules (Firebase web SDK in Node; requires the users-rule change deployed) ─

test('rules: a teacher cannot change or remove their own departmentId', async () => {
  const probe = await openProbe(DEPT_TEACHER_EMAIL, deptTeacherPassword());
  try {
    // If the users-rule restriction is NOT deployed, the "denied" writes below
    // actually succeed and would silently change this shared fixture — the
    // finally block restores the department either way.
    const me = doc(probe.db, 'users', probe.uid);
    // Positive control: a write to the same document by the same user succeeds
    // when it does not change departmentId (a no-op write of the current value),
    // so the denials below are about departmentId specifically.
    await expectAllowed(
      'control: owner writes their own doc without changing departmentId',
      updateDoc(me, { departmentId: ctx.deptTeacher.departmentId }),
    );

    await expectDenied('owner changes their own departmentId', updateDoc(me, { departmentId: 'some-other-department' }));
    await expectDenied('owner removes their own departmentId', updateDoc(me, { departmentId: deleteField() }));
  } finally {
    await probe.close();
    // Safety net via the Admin SDK (bypasses rules): put the department back if a probe changed it.
    await db().collection('users').doc(ctx.deptTeacher.uid).update({ departmentId: ctx.deptTeacher.departmentId });
  }

  const after = await userByEmail(DEPT_TEACHER_EMAIL);
  expect(after.departmentId, 'departmentId must be unchanged after the probes').toBe(ctx.deptTeacher.departmentId);
});
