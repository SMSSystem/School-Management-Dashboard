import { test, expect, type Page } from '@playwright/test';
import { forceLiveData, login, dismissTourIfPresent } from './helpers';

// §11's third QA leg: "General + Subject Attendance: confirm session-date
// validity (isSchoolDay/isSubjectSessionDay) works correctly against a
// custom time block's own schoolWeekDays, independent of any other
// concurrently active block's dates."
//
// Only General Attendance is driven end-to-end here. Subject Attendance's
// own isSubjectSessionDay() (src/scenes/(dashboard)/attendance/subject/
// index.tsx:112) calls `if (!isSchoolDay(...)) return false` FIRST, before
// its own subject-frequency check — it's literally the same isSchoolDay()
// reading the same effectiveYear.schoolWeekDays that this spec already
// exercises. Building a second full fixture (subject + subjectEnrollments)
// to re-prove the identical underlying check would be duplicate effort for
// no new signal; spec 02 already confirmed Subject Attendance's Time Block
// selector itself lists and switches between both blocks correctly.
//
// Fixture (idempotent — checks the Classes/students list before creating):
// one class + one enrolled student per time block, so General Attendance's
// student table (which only renders once a class has students) has
// something to show. Cohort A is Mon-Fri, Cohort B is Tue/Thu only (set up
// by 00-setup-custom-institution.spec.ts) — genuinely different patterns,
// so a header showing the right school days per block is real signal, not
// coincidence.

const INSTITUTION_NAME = process.env.QA_CUSTOM_INSTITUTION_NAME;
const ADMIN_EMAIL = process.env.QA_CUSTOM_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.QA_CUSTOM_ADMIN_PASSWORD;

const BLOCK_A_NAME = 'Mechanical Workshop 1 — Cohort A'; // Mon-Fri
const BLOCK_B_NAME = 'Mechanical Workshop 1 — Cohort B'; // Tue/Thu

const FIXTURES = [
  { className: 'QA Cohort A Class', blockName: BLOCK_A_NAME, studentEmail: 'qa.cohort.a.student@demo.com', studentName: 'QaCohortA Student' },
  { className: 'QA Cohort B Class', blockName: BLOCK_B_NAME, studentEmail: 'qa.cohort.b.student@demo.com', studentName: 'QaCohortB Student' },
];

async function ensureClassExists(page: Page, className: string, termLabel: string) {
  await page.goto('/dashboard/list/classes');
  await dismissTourIfPresent(page);
  if (await page.getByText(className, { exact: true }).isVisible().catch(() => false)) return;

  await page.getByRole('button', { name: 'Add new class' }).click();
  await page.locator('input[name="name"]').fill(className);
  await page.locator('input[name="capacity"]').fill('20');
  // Programme Year (grade) deliberately left blank — custom mode makes it
  // optional (item 7), and leaving it blank here doubles as fixture data
  // 05-report-card-grade-fallback.spec.ts can reuse without needing its own
  // gradeless class.
  await page.locator('select[name="termId"]').selectOption({ label: termLabel });
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(className, { exact: true })).toBeVisible({ timeout: 10_000 });
}

async function ensureStudentExists(page: Page, studentName: string, email: string, className: string) {
  await page.goto('/dashboard/list/students');
  await dismissTourIfPresent(page);
  if (await page.getByText(studentName, { exact: true }).isVisible().catch(() => false)) return;

  await page.goto('/dashboard/create-user');
  await dismissTourIfPresent(page);
  const [firstName, lastName] = studentName.split(' ');
  await page.locator('#tour-create-user-first-name').fill(firstName);
  await page.locator('#tour-create-user-last-name').fill(lastName);
  await page.locator('#tour-create-user-email').fill(email);
  await page.locator('#tour-create-user-password').fill('Password123');
  await page.locator('#tour-create-user-confirm-password').fill('Password123');
  await page.locator('#tour-create-user-role').selectOption({ label: 'Student' });
  await page.locator('#tour-create-user-class').selectOption({ label: className });
  await page.locator('#tour-create-user-dob').fill('2006-01-15');
  await page.locator('#tour-create-user-gender').selectOption({ label: 'Female' });
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(`${studentName} was created successfully.`)).toBeVisible({ timeout: 10_000 });
}

test('General Attendance: isSchoolDay reflects each block\'s own schoolWeekDays, independently', async ({ page, context }) => {
  test.skip(
    !INSTITUTION_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'QA_CUSTOM_INSTITUTION_NAME / QA_CUSTOM_ADMIN_EMAIL / QA_CUSTOM_ADMIN_PASSWORD missing from .env.qa — run 00-setup-custom-institution.spec.ts first',
  );

  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  // Classes are created in a first pass, fully separate from the students
  // loop below — not just tidiness. AdminCreateUserForm's class dropdown
  // reads via fetchInstitutionClasses(), a react-query fetchQuery with a
  // 60s staleTime backed by a localStorage persister (src/lib/queryClient.ts)
  // — interleaving "create class B, then immediately visit /dashboard/
  // create-user for student B" after already having visited that same page
  // for student A (which caches the classes list as it existed with only
  // class A) served that stale, pre-class-B cached result for a full 60s,
  // and class B's option never appeared. Unrelated to calendarMode/custom
  // time blocks — a general caching behavior any institution would hit the
  // same way; not this feature's bug to fix, just this spec's ordering to
  // avoid.
  await test.step('ensure fixture classes exist', async () => {
    for (const f of FIXTURES) {
      await ensureClassExists(page, f.className, f.blockName);
    }
  });
  await test.step('ensure fixture students exist', async () => {
    for (const f of FIXTURES) {
      await ensureStudentExists(page, f.studentName, f.studentEmail, f.className);
    }
  });

  await page.goto('/dashboard/attendance/general');
  await dismissTourIfPresent(page);

  const blockSelect = page.locator('select').filter({ has: page.locator('option', { hasText: BLOCK_A_NAME }) });
  // Not pinned to either class name: switching the block re-scopes the class
  // select's own options to just that block's classes (confirmed working as
  // intended — the class list genuinely differs per block, which is why a
  // locator anchored to one specific class name stops matching once the
  // other block is selected). Distinguished from the block select (options
  // contain "Mechanical Workshop") and the dev-only DevDataModeToggle
  // select (options contain "Data", e.g. "🧪 Mock Data") by excluding both.
  const classSelect = page
    .locator('select')
    .filter({ hasNot: page.locator('option', { hasText: 'Mechanical Workshop' }) })
    .filter({ hasNot: page.locator('option', { hasText: 'Data' }) });

  await test.step('Cohort A (Mon-Fri): Mon/Wed/Fri are school days, Sat/Sun are not', async () => {
    await blockSelect.selectOption({ label: BLOCK_A_NAME });
    await classSelect.selectOption({ label: 'QA Cohort A Class' });
    await expect(page.getByText('No students found for this class.')).toHaveCount(0, { timeout: 10_000 });

    for (const day of ['Mon', 'Wed', 'Fri']) {
      const cls = await page.locator('th', { hasText: day }).first().getAttribute('class');
      expect(cls, `${day} should be styled as a school day for Cohort A`).toContain('text-gray-700');
    }
    for (const day of ['Sat', 'Sun']) {
      const cls = await page.locator('th', { hasText: day }).first().getAttribute('class');
      expect(cls, `${day} should be styled as a non-school-day`).toContain('text-gray-400');
    }
  });

  await test.step('Cohort B (Tue/Thu only): only Tue/Thu are school days', async () => {
    await blockSelect.selectOption({ label: BLOCK_B_NAME });
    await classSelect.selectOption({ label: 'QA Cohort B Class' });
    await expect(page.getByText('No students found for this class.')).toHaveCount(0, { timeout: 10_000 });

    for (const day of ['Tue', 'Thu']) {
      const cls = await page.locator('th', { hasText: day }).first().getAttribute('class');
      expect(cls, `${day} should be styled as a school day for Cohort B`).toContain('text-gray-700');
    }
    // Mon/Wed/Fri are school days for Cohort A but NOT Cohort B — the core
    // "independent of the other block" assertion this leg exists to make.
    for (const day of ['Mon', 'Wed', 'Fri', 'Sat', 'Sun']) {
      const cls = await page.locator('th', { hasText: day }).first().getAttribute('class');
      expect(cls, `${day} should be styled as a non-school-day for Cohort B`).toContain('text-gray-400');
    }
  });
});
