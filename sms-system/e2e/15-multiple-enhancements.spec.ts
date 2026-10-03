import { test, expect, type Page } from '@playwright/test';
import { forceLiveData, login, logout, dismissTourIfPresent } from './helpers';
import {
  HAS_ADMIN_SDK,
  db,
  institutionId,
  restoreUserFields,
  snapshotUser,
  userByEmail,
  type UserInfo,
} from './lesson-notes-support';

// The "multiple-enhancements" branch: house students A-Z and class by name, the
// student's class by name, eye buttons and detail pages for classes / subjects /
// terms, the unmarked students named in the attendance "save anyway?" dialogs,
// and the labelled bulk "Fill" button on both registers. Ground truth comes from
// the Admin SDK. Nothing here writes attendance: every test stops at a dialog.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const HOUSE_NAME = 'QA Enhancements House';

type Key = 'admin' | 'teacher' | 'student';

function creds(key: Key): { email: string; password: string } {
  const e = process.env;
  switch (key) {
    case 'admin':
      return { email: e.QA_ADMIN_EMAIL!, password: e.QA_ADMIN_PASSWORD! };
    case 'student':
      return { email: e.QA_ASSIGNMENTS_STUDENT_EMAIL!, password: e.QA_ASSIGNMENTS_STUDENT_PASSWORD! };
    case 'teacher':
      return { email: 'qa.lessons.teacher@demo.com', password: e.QA_LESSONS_TEACHER_PASSWORD ?? 'Teacher0123456789' };
  }
}

const ctx = { iid: '', users: {} as Record<Key, UserInfo> };

async function loginAs(page: Page, key: Key) {
  await login(page, { institutionLabel: INSTITUTION_NAME!, ...creds(key) });
  if (key === 'admin') await dismissTourIfPresent(page);
}

// The one-active-session lock (spec 13) would refuse the next test's sign-in as
// the same user if this tab were still holding it.
async function signOutQuietly(page: Page) {
  await logout(page).catch(() => undefined);
}

async function className(classId: string): Promise<string | null> {
  const snap = await db().collection('institutions').doc(ctx.iid).collection('classes').doc(classId).get();
  return snap.exists ? ((snap.data()!.name as string) ?? null) : null;
}

async function studentNamesInClass(classId: string): Promise<string[]> {
  const snap = await db()
    .collection('users')
    .where('institutionId', '==', ctx.iid)
    .where('role', '==', 'student')
    .where('classId', '==', classId)
    .get();
  return snap.docs.map((d) => String(d.data().name));
}

const byLocale = (a: string, b: string) => a.localeCompare(b);

const SUBJECT_NAME = 'QA Enhancements Subject';
const TERM_NAME = 'QA Enhancements Term';
const fixtures = { subjectId: '', termId: '', movedStudent: null as null | { uid: string; before: Record<string, unknown> } };

// The QA institution may have no subjects or terms, and its one QA class may have
// a single student. The fixtures below are created through the Admin SDK before
// the tests and removed after, so the tests never skip for lack of data.
async function seedFixtures(studentClassId: string | undefined) {
  const col = (name: string) => db().collection('institutions').doc(ctx.iid).collection(name);
  const subject = col('subjects').doc();
  await subject.set({
    name: SUBJECT_NAME,
    description: 'QA fixture',
    institutionId: ctx.iid,
    classScope: 'institution',
    classIds: [],
    classNames: [],
    teacherIds: [],
    teacherNames: [],
    cwWeight: 40,
    examWeight: 60,
    frequency: 'daily',
    // A "daily" subject still lists its session weekdays (Mon-Fri).
    sessionDayOfWeek: [1, 2, 3, 4, 5],
    createdAt: new Date(),
    createdBy: 'qa-enhancements',
    updatedAt: new Date(),
    updatedBy: 'qa-enhancements',
  });
  fixtures.subjectId = subject.id;

  const term = col('terms').doc();
  await term.set({
    name: TERM_NAME,
    institutionId: ctx.iid,
    startDate: '2099-01-01',
    endDate: '2099-03-31',
    status: 'upcoming',
  });
  fixtures.termId = term.id;

  // A second student in the QA class, so the registers have someone to leave unmarked.
  if (studentClassId && (await studentNamesInClass(studentClassId)).length < 2) {
    const others = await db()
      .collection('users')
      .where('institutionId', '==', ctx.iid)
      .where('role', '==', 'student')
      .get();
    const other = others.docs.find((d) => d.id !== ctx.users.student.uid && d.data().classId !== studentClassId);
    if (other) {
      fixtures.movedStudent = { uid: other.id, before: await snapshotUser(other.id) };
      await other.ref.update({ classId: studentClassId });
    }
  }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required');
  test.skip(!INSTITUTION_NAME, 'QA_INSTITUTION_NAME missing from .env.qa');
  ctx.iid = await institutionId();
  const keys: Key[] = ['admin', 'teacher', 'student'];
  for (const k of keys) ctx.users[k] = await userByEmail(creds(k).email);
  await seedFixtures((await snapshotUser(ctx.users.student.uid)).classId as string | undefined);
});

test.afterAll(async () => {
  if (!HAS_ADMIN_SDK || !INSTITUTION_NAME || !ctx.iid) return;
  const col = (name: string) => db().collection('institutions').doc(ctx.iid).collection(name);
  if (fixtures.subjectId) await col('subjects').doc(fixtures.subjectId).delete().catch(() => undefined);
  if (fixtures.termId) await col('terms').doc(fixtures.termId).delete().catch(() => undefined);
  if (fixtures.movedStudent) {
    await restoreUserFields(fixtures.movedStudent.uid, fixtures.movedStudent.before, ['classId']);
  }
});

// ── House detail ─────────────────────────────────────────────────────────────

test('House detail: Assigned Students are A-Z and the Class column shows names, not ids', async ({ page, context }) => {
  await forceLiveData(context);
  const studentsSnap = await db()
    .collection('users')
    .where('institutionId', '==', ctx.iid)
    .where('role', '==', 'student')
    .get();
  const withClass = studentsSnap.docs.filter((d) => d.data().classId);
  test.skip(withClass.length < 3, 'needs at least three QA students that have a class');
  const chosen = withClass.slice(0, 4);

  const before = new Map<string, Record<string, unknown>>();
  for (const d of chosen) before.set(d.id, await snapshotUser(d.id));
  const houseRef = db().collection('institutions').doc(ctx.iid).collection('houses').doc();
  const classNames = new Map<string, string>();

  try {
    await houseRef.set({ name: HOUSE_NAME, description: 'QA fixture', institutionId: ctx.iid });
    for (const d of chosen) {
      await d.ref.update({ houseId: houseRef.id, houseName: HOUSE_NAME });
      classNames.set(String(d.data().name), (await className(String(d.data().classId))) ?? '');
    }

    await loginAs(page, 'admin');
    await page.goto(`/dashboard/list/houses/${houseRef.id}`);
    await expect(page.getByRole('heading', { name: HOUSE_NAME })).toBeVisible({ timeout: 20_000 });
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(chosen.length, { timeout: 20_000 });

    const names = await rows.locator('td:nth-child(1)').allTextContents();
    expect(names, 'students sorted A-Z').toEqual([...names].sort(byLocale));

    const classCells = await rows.locator('td:nth-child(2)').allTextContents();
    for (const [i, name] of names.entries()) {
      expect(classCells[i], `class of ${name}`).toBe(classNames.get(name));
      expect(classCells[i]).not.toMatch(/^[A-Za-z0-9]{20}$/); // never a raw Firestore id
    }
  } finally {
    for (const d of chosen) await restoreUserFields(d.id, before.get(d.id)!, ['houseId', 'houseName']);
    await houseRef.delete().catch(() => undefined);
    await signOutQuietly(page);
  }
});

// ── Student detail ───────────────────────────────────────────────────────────

test('Student detail: Class shows the class name, not its id', async ({ page, context }) => {
  await forceLiveData(context);
  const student = await snapshotUser(ctx.users.student.uid);
  const classId = student.classId as string | undefined;
  test.skip(!classId, 'the QA student has no class');
  const expected = await className(classId!);
  test.skip(!expected, 'the QA student class no longer exists');

  try {
    await loginAs(page, 'admin');
    await page.goto(`/dashboard/list/students/${ctx.users.student.uid}`);
    const classValue = page.locator('dl dt', { hasText: /^Class$/ }).locator('xpath=following-sibling::dd');
    await expect(classValue).toHaveText(expected!, { timeout: 20_000 });
    await expect(classValue).not.toHaveText(classId!);
  } finally {
    await signOutQuietly(page);
  }
});

// ── Eye buttons and detail pages ─────────────────────────────────────────────

test('Classes, Subjects and Terms: each list row has an eye button that opens its detail page', async ({ page, context }) => {
  await forceLiveData(context);
  const studentClassId = (await snapshotUser(ctx.users.student.uid)).classId as string | undefined;
  test.skip(!studentClassId, 'the QA student has no class');
  const classTitle = (await className(studentClassId!))!;
  const enrolled = (await studentNamesInClass(studentClassId!)).sort(byLocale);

  try {
    await loginAs(page, 'admin');

    await test.step('class: the eye opens a page with the enrolled students A-Z', async () => {
      await page.goto('/dashboard/list/classes');
      await page.getByRole('button', { name: `View ${classTitle}'s details` }).first().click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/list/classes/${studentClassId}$`));
      await expect(page.getByRole('heading', { name: classTitle, level: 1 })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('heading', { name: `Enrolled Students (${enrolled.length})` })).toBeVisible({
        timeout: 20_000,
      });
      const listed = await page
        .locator('h2', { hasText: /^Enrolled Students/ })
        .locator('xpath=following-sibling::ul[1]//li//a')
        .allTextContents();
      expect(listed).toEqual(enrolled);
      await page.getByRole('link', { name: /Back to Classes/ }).click();
      await expect(page).toHaveURL(/\/dashboard\/list\/classes$/);
    });

    await test.step('subject: the eye opens a page with teachers and classes', async () => {
      await page.goto('/dashboard/list/subjects');
      await page.getByRole('button', { name: `View ${SUBJECT_NAME}'s details` }).click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/list/subjects/${fixtures.subjectId}$`));
      await expect(page.getByRole('heading', { name: SUBJECT_NAME, level: 1 })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('heading', { name: /^Teachers \(\d+\)$/ })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Classes', level: 2 })).toBeVisible();
    });

    await test.step('term: the eye opens a page with the dates and status', async () => {
      await page.goto('/dashboard/list/terms');
      await page.getByRole('button', { name: `View ${TERM_NAME}'s details` }).click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/list/terms/${fixtures.termId}$`));
      await expect(page.getByRole('heading', { name: TERM_NAME, level: 1 })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('dt', { hasText: /^Start date$/ })).toBeVisible();
      await expect(page.locator('dt', { hasText: /^Status$/ })).toBeVisible();
    });
  } finally {
    await signOutQuietly(page);
  }
});

test('Detail pages follow the list audience: a teacher can open a class, not a subject or a term', async ({ page, context }) => {
  await forceLiveData(context);
  try {
    await loginAs(page, 'teacher');
    await page.goto('/dashboard/list/classes');
    const eye = page.getByRole('button', { name: /^View .*'s details$/ }).first();
    await expect(eye).toBeVisible({ timeout: 20_000 });
    await eye.click();
    await expect(page).toHaveURL(/\/dashboard\/list\/classes\/[^/]+$/);
    await expect(page.getByRole('heading', { name: /^Enrolled Students/ })).toBeVisible({ timeout: 20_000 });

    await page.goto('/dashboard/list/subjects/anything');
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/dashboard/list/terms/anything');
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await signOutQuietly(page);
  }
});

// ── General attendance register ──────────────────────────────────────────────

test('General register: a labelled Fill button fills the empty cells, and Save All names the unmarked students', async ({ page, context }) => {
  await forceLiveData(context);
  const classId = (await snapshotUser(ctx.users.student.uid)).classId as string | undefined;
  test.skip(!classId, 'the QA student has no class');
  const title = (await className(classId!))!;
  const everyone = (await studentNamesInClass(classId!)).sort(byLocale);
  test.skip(everyone.length < 2, 'the QA class needs at least two students');

  try {
    await loginAs(page, 'admin');
    await page.goto('/dashboard/attendance/general');
    await page.locator('select', { hasText: 'Select a class…' }).selectOption({ label: title });
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });

    const fill = page.getByRole('button', { name: /^Fill empty AM cells for/ }).first();
    test.skip((await fill.count()) === 0, 'no school day up to today in the current week and term');
    await expect(fill).toBeVisible();
    await expect(fill).toHaveText(/Fill/); // a labelled button, not a bare icon

    const emptyBefore = await page.locator('div.border-dashed').count();
    await fill.click();
    await page.getByRole('button', { name: /^P — Present$/ }).click();
    const dialog = page.locator('div', { has: page.getByRole('heading', { name: 'Confirm Fill' }) }).last();
    await expect(dialog).toBeVisible();
    const text = (await dialog.textContent()) ?? '';
    const filled = Number(/Mark (\d+) empty/.exec(text)?.[1] ?? '0');
    expect(filled).toBeGreaterThan(0);
    await page.getByRole('button', { name: `Fill ${filled}` }).click();
    await expect.poll(async () => page.locator('div.border-dashed').count()).toBe(emptyBefore - filled);

    await test.step('with a second, half-marked session, Save All lists who is unmarked by name', async () => {
      const firstRow = page.locator('tbody tr').first();
      const markedStudent = ((await firstRow.locator('td').first().textContent()) ?? '').trim();
      const dashed = firstRow.locator('div.border-dashed').first();
      test.skip((await dashed.count()) === 0, 'no second session to mark this week');
      await dashed.click();

      await page.getByRole('button', { name: /^Save All \(\d+\)$/ }).click();
      await expect(page.getByRole('heading', { name: 'Confirm Save All' })).toBeVisible();
      const missing = page.getByTestId('missing-students');
      await expect(missing).toBeVisible();
      const listed = await missing.locator('li').allTextContents();
      for (const name of everyone.filter((n) => n !== markedStudent)) expect(listed).toContain(name);
      expect(listed).not.toContain(markedStudent);
      // Cancel: this test never saves attendance.
      await page.getByRole('button', { name: 'Cancel' }).last().click();
    });
  } finally {
    await signOutQuietly(page);
  }
});

// ── Subject attendance register ──────────────────────────────────────────────

test('Subject register: a labelled Fill button fills the empty cells, and Save anyway names the unmarked students', async ({ page, context }) => {
  await forceLiveData(context);
  const classId = (await snapshotUser(ctx.users.student.uid)).classId as string | undefined;
  test.skip(!classId, 'the QA student has no class');
  const title = (await className(classId!))!;
  const everyone = (await studentNamesInClass(classId!)).sort(byLocale);
  test.skip(everyone.length < 2, 'the QA class needs at least two students');

  // The seeded subject runs daily for every class, so this week has session dates.
  try {
    await loginAs(page, 'admin');
    await page.goto('/dashboard/attendance/subject');
    await page.locator('select', { hasText: 'Select a subject…' }).selectOption({ label: SUBJECT_NAME });
    const classSelect = page.locator('select', { hasText: 'Select a class…' });
    if ((await classSelect.count()) > 0) await classSelect.selectOption({ label: title });
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 20_000 });

    const fill = page.getByRole('button', { name: /^Fill empty cells for/ }).first();
    test.skip((await fill.count()) === 0, 'no session day up to today in the current week and term');
    await expect(fill).toHaveText(/Fill/);

    const emptyBefore = await page.locator('div.border-dashed').count();
    await fill.click();
    await page.getByRole('button', { name: /^P — Present$/ }).click();
    const dialog = page.locator('div', { has: page.getByRole('heading', { name: 'Confirm Fill' }) }).last();
    const text = (await dialog.textContent()) ?? '';
    const filled = Number(/Mark (\d+) empty/.exec(text)?.[1] ?? '0');
    expect(filled).toBeGreaterThan(0);
    await page.getByRole('button', { name: `Fill ${filled}` }).click();
    await expect.poll(async () => page.locator('div.border-dashed').count()).toBe(emptyBefore - filled);

    await test.step('saving a half-marked date lists who is unmarked by name', async () => {
      const firstRow = page.locator('tbody tr').first();
      const markedStudent = ((await firstRow.locator('td').first().textContent()) ?? '').trim();
      const dashed = firstRow.locator('div.border-dashed').first();
      test.skip((await dashed.count()) === 0, 'no second session date to mark this week');
      await dashed.click();

      // A date with a draft gets its own Save button; the first press warns, then offers "Save anyway".
      await page.getByRole('button', { name: /^Save [A-Z][a-z]{2} \d{1,2}$/ }).last().click();
      await page.getByRole('button', { name: 'Save anyway' }).click();
      await expect(page.getByRole('heading', { name: 'Confirm Save' })).toBeVisible();
      const listed = await page.getByTestId('missing-students').locator('li').allTextContents();
      for (const name of everyone.filter((n) => n !== markedStudent)) expect(listed).toContain(name);
      expect(listed).not.toContain(markedStudent);
      await page.getByRole('button', { name: 'Cancel' }).last().click();
    });
  } finally {
    await signOutQuietly(page);
  }
});
