import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { dismissTourIfPresent, forceLiveData, login } from './helpers';
import {
  HAS_ADMIN_SDK,
  db,
  institutionId,
  restoreUserFields,
  setUserFields,
  snapshotUser,
  userByEmail,
} from './lesson-notes-support';

// The redesigned Schedule page (docs/miscellaneous-specs/SCHEDULE_PAGE_REDESIGN_SPEC.md, PR B), driven against the
// live QA institution. Read-only except one test, which gives the QA senior teacher schedule access and takes it away
// again. Reads stay small: each class or teacher week is one cached query, and moving between weeks of the same term
// reads nothing.

const INSTITUTION_NAME = process.env.QA_INSTITUTION_NAME;
const ADMIN = { email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD };
const SENIOR = { email: process.env.QA_SENIOR_TEACHER_EMAIL, password: process.env.QA_SENIOR_TEACHER_PASSWORD };
const PARENT = { email: process.env.QA_PARENT_EMAIL, password: process.env.QA_PARENT_PASSWORD };
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function signIn(page: Page, who: { email?: string; password?: string }) {
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: who.email!, password: who.password! });
  await dismissTourIfPresent(page);
}

async function openSchedule(page: Page, query = '') {
  await page.goto(`/dashboard/schedule${query}`);
  await dismissTourIfPresent(page);
}

const param = (page: Page, name: string) => new URL(page.url()).searchParams.get(name);

test.beforeEach(() => {
  test.skip(!INSTITUTION_NAME || !ADMIN.email || !ADMIN.password, 'QA institution or admin missing from .env.qa');
});

test.describe('admin (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('chooses a class or a teacher, moves between weeks, and keeps it all in the URL', async ({ page, context }) => {
    await forceLiveData(context);
    await signIn(page, ADMIN);
    await openSchedule(page);

    const next = page.getByRole('button', { name: 'Next week' });
    await expect(next).toBeVisible({ timeout: 25_000 });
    await expect(page.getByLabel('Term')).toHaveCount(0);

    // A class first (natural order), then a teacher.
    const kind = page.getByLabel('Show a class or a teacher');
    await expect(kind).toHaveValue('class');
    const classSelect = page.getByLabel('Class', { exact: true });
    const classCount = await classSelect.locator('option').count();
    expect(classCount).toBeGreaterThan(0);
    if (classCount > 1) {
      const second = await classSelect.locator('option').nth(1).getAttribute('value');
      await classSelect.selectOption(second!);
      await expect.poll(() => param(page, 'id')).toBe(second);
      expect(param(page, 'by')).toBe('class');
    }
    await kind.selectOption('teacher');
    await expect(page.getByLabel('Teacher', { exact: true })).toBeVisible();
    await expect.poll(() => param(page, 'by')).toBe('teacher');
    const teacherId = param(page, 'id');

    // Week | Day.
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Day' }).click();
    await expect(page.getByRole('group', { name: 'Day of the week' })).toBeVisible();
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Week' }).click();
    await expect(page.getByRole('group', { name: 'Day of the week' })).toHaveCount(0);

    // The arrows, Today, and a reload that keeps the week and the teacher.
    const opening = param(page, 'week');
    const today = page.getByRole('button', { name: 'Today' });
    if (await next.isEnabled()) {
      await next.click();
      await expect.poll(() => param(page, 'week')).not.toBe(opening);
      const moved = param(page, 'week');
      await expect(today).toBeEnabled();
      await page.reload();
      await expect(next).toBeVisible({ timeout: 25_000 });
      expect(param(page, 'week')).toBe(moved);
      expect(param(page, 'by')).toBe('teacher');
      expect(param(page, 'id')).toBe(teacherId);
      await today.click();
      await expect.poll(() => param(page, 'week')).toBe(opening);
      await expect(today).toBeDisabled();
    }
  });

  test('stops at the start of the year, with a note', async ({ page, context }) => {
    await forceLiveData(context);
    await signIn(page, ADMIN);
    // Far before any school year: the week is clamped to the first one, and the arrow is disabled there.
    await openSchedule(page, '?week=2000-01-03');
    const prev = page.getByRole('button', { name: 'Previous week' });
    await expect(prev).toBeVisible({ timeout: 25_000 });
    await expect(prev).toBeDisabled();
    await expect(page.getByText(/^The timetable before .+ isn't available here\.$/)).toBeVisible();
  });

  test('names a holiday on its day', async ({ page, context }) => {
    test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required');
    const iid = await institutionId();
    const today = new Date().toISOString().slice(0, 10);
    const snap = await db().collection('institutions').doc(iid).collection('nonSchoolDays').where('isActive', '==', true).get();
    const holiday = snap.docs
      .map((d) => d.data())
      .map((d) => ({ date: (d.type === 'range' ? d.startDate : d.date) as string, reason: String(d.reason ?? '') }))
      .filter((d) => d.date && d.reason && d.date >= today && new Date(`${d.date}T12:00`).getDay() % 6 !== 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    test.skip(!holiday, 'No upcoming weekday holiday in the QA institution');

    await forceLiveData(context);
    await signIn(page, ADMIN);
    await openSchedule(page, `?week=${holiday.date}&view=day&day=${holiday.date}`);
    await expect(page.getByText(`: ${holiday.reason}.`, { exact: false })).toBeVisible({ timeout: 25_000 });
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`has no WCAG 2.2 AA violations (${scheme})`, async ({ page, context }) => {
      await forceLiveData(context);
      // The app follows its own theme setting (the header's dark-mode toggle), not only the device preference.
      await context.addInitScript((theme) => window.localStorage.setItem('theme', theme), scheme);
      await page.emulateMedia({ colorScheme: scheme });
      await signIn(page, ADMIN);
      await openSchedule(page);
      await expect(page.getByRole('button', { name: 'Next week' })).toBeVisible({ timeout: 25_000 });
      const result = await new AxeBuilder({ page }).include('main').withTags(WCAG_TAGS).analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
});

test('senior teacher: opens on their own week, and may look at other teachers', async ({ page, context }) => {
  test.skip(!SENIOR.email || !SENIOR.password || !HAS_ADMIN_SDK, 'QA senior teacher or service account missing');
  const me = await userByEmail(SENIOR.email!);
  await forceLiveData(context);
  await signIn(page, SENIOR);
  await openSchedule(page);
  const teacher = page.getByLabel('Teacher', { exact: true });
  await expect(teacher).toBeVisible({ timeout: 25_000 });
  await expect(teacher).toHaveValue(me.uid);
  // The list comes from the subjects' teachers (spec D13), so it is not limited to the senior teacher's department.
  expect(await teacher.locator('option').count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByLabel('Show a class or a teacher')).toBeVisible();
});

// Needs the firestore.rules clause that lets a senior teacher read their own department's teachers (deploy it first:
// npm run firebase:deploy:rules). The QA institution has no timetable, so the test adds two slots to one class in the
// active term (one taught by the senior teacher, one by a teacher outside their department), gives the senior teacher
// schedule access, checks Edit, then deletes both slots and restores the field.
test("senior teacher with schedule access: Edit only on their own department's lessons", async ({ page, context }) => {
  test.skip(!SENIOR.email || !SENIOR.password || !HAS_ADMIN_SDK, 'QA senior teacher or service account missing');
  const me = await userByEmail(SENIOR.email!);
  test.skip(!me.departmentId, 'The QA senior teacher has no department');
  const iid = await institutionId();
  const inst = db().collection('institutions').doc(iid);
  const today = new Date().toLocaleDateString('en-CA');

  // The active term covering today, a class, and a teacher outside the senior teacher's department.
  const years = await inst.collection('academicYears').where('status', '==', 'active').get();
  const yearIds = new Set(years.docs.map((d) => d.id));
  const term = (await inst.collection('terms').get()).docs.find(
    (d) =>
      yearIds.has(d.data().academicYearId as string) &&
      (d.data().startDate as string) <= today &&
      today <= (d.data().endDate as string),
  );
  const cls = (await inst.collection('classes').limit(1).get()).docs[0];
  const staff = await db()
    .collection('users')
    .where('institutionId', '==', iid)
    .where('role', 'in', ['regular_teacher', 'senior_teacher'])
    .get();
  const outsider = staff.docs.find((d) => d.data().departmentId !== me.departmentId);
  test.skip(!term || !cls || !outsider, 'The QA institution needs an active term covering today, a class and a teacher outside the department');

  const slot = (id: string, teacherId: string, teacherName: string, subjectName: string, startTime: string) => ({
    id,
    data: {
      institutionId: iid,
      termId: term!.id,
      termName: String(term!.data().name ?? ''),
      subjectId: `e2e-${id}`,
      subjectName,
      teacherId,
      teacherName,
      classId: cls!.id,
      className: String(cls!.data().name ?? ''),
      days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      startTime,
      duration: 30,
      createdBy: me.uid,
      createdByRole: 'senior_teacher',
      createdAt: new Date().toISOString(),
    },
  });
  const seeded = [
    slot('e2e-schedule-own', me.uid, me.name, 'E2E Own Department', '06:00'),
    slot('e2e-schedule-other', outsider!.id, String(outsider!.data().name ?? ''), 'E2E Other Department', '06:45'),
  ];

  const before = await snapshotUser(me.uid);
  try {
    for (const s of seeded) await inst.collection('timetable_slots').doc(s.id).set(s.data);
    await setUserFields(me.uid, { canGenerateSchedule: true });
    await forceLiveData(context);
    await signIn(page, SENIOR);
    await openSchedule(page, `?by=class&id=${cls!.id}&view=week`);
    await expect(page.getByRole('button', { name: 'Next week' })).toBeVisible({ timeout: 25_000 });

    const card = (subject: string) => page.getByRole('group', { name: new RegExp(`^${subject},`) }).first();
    await expect(card('E2E Own Department')).toBeVisible({ timeout: 20_000 });
    await expect(card('E2E Own Department').getByRole('button', { name: 'Edit timetable slot' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(card('E2E Other Department')).toBeVisible();
    await expect(card('E2E Other Department').getByRole('button', { name: 'Edit timetable slot' })).toHaveCount(0);
  } finally {
    for (const s of seeded) await inst.collection('timetable_slots').doc(s.id).delete();
    await restoreUserFields(me.uid, before, ['canGenerateSchedule']);
  }
});


test('parent: the child\'s timetable, with a chip per child when there are several', async ({ page, context }) => {
  test.skip(!PARENT.email || !PARENT.password, 'QA parent missing from .env.qa');
  await forceLiveData(context);
  await signIn(page, PARENT);
  await openSchedule(page);
  await expect(page.getByRole('heading', { level: 2, name: /'s timetable$/ })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByLabel('Show a class or a teacher')).toHaveCount(0);
  const chips = page.getByRole('group', { name: 'Child' }).getByRole('button');
  if ((await chips.count()) > 1) {
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    const name = (await chips.nth(1).innerText()).trim();
    await expect(page.getByRole('heading', { level: 2, name: `${name}'s timetable` })).toBeVisible();
  }
});
