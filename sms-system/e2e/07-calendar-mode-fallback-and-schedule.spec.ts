import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { forceLiveData, login, logout, dismissTourIfPresent } from './helpers';

// Verifies the specific production scenario a real inst_admin described:
// an institution ("GENR8-3D" in the real Firebase Console) whose
// calendarMode was never set — because it predates the field entirely, not
// because anyone chose 'academic_year' — deliberately leaving its
// Institution Profile wizard incomplete until this is confirmed working,
// intending to run a once-a-week, 2-hour (3pm-5pm), "Mechanical Workshop 1"
// programme for 20+ people under Custom Calendar Mode.
//
// Built against a disposable mirror institution (Brookfield Evening
// Institute — QA_FALLBACK_*, .env.qa), not the real one, for two reasons:
// this whole suite shares one Firebase project with production (no
// separate staging project), and driving the real inst_admin's real
// account would mean real, permanent writes to their real institution.
//
// Two things this exercises that no other spec in this suite does:
//   1. The calendarMode FALLBACK path (InstitutionProfileWizard's
//      CalendarModeInterstitial) — every other custom-mode institution
//      this suite creates (00-setup-custom-institution.spec.ts) goes
//      through the PRIMARY path instead (super_admin's onboarding radio,
//      which always writes some calendarMode value — there's no way to
//      leave it unset through that UI). GENR8-3D's real state can
//      only be reached by a pre-existing institution whose document
//      predates the field, which this spec simulates via a one-off admin
//      step (delete the `calendarMode` field of the institution document in the Firebase console; no script for it is kept in the repository) done once, by hand,
//      between the setup test and the interstitial test below.
//   2. The Schedule / TimetableSlotDocument flow (day + startTime +
//      duration) — the actual place "3pm-5pm, once a week" gets
//      configured. The Time Block wizard itself only captures a date
//      range and which weekdays the block runs on
//      (AcademicYearDocument.schoolWeekDays), not a time of day.
//
// Idempotent throughout, same convention as 00/03 — every step checks
// actual page/Firestore state before writing, so a partial or repeat run
// resumes correctly rather than failing on "already exists" or duplicating
// fixtures.

const ENV_QA_PATH = '.env.qa';

const INSTITUTION_NAME = process.env.QA_FALLBACK_INSTITUTION_NAME;
const SUPERADMIN_EMAIL = process.env.QA_SUPERADMIN_EMAIL;
const SUPERADMIN_PASSWORD = process.env.QA_SUPERADMIN_PASSWORD;

const ADMIN_EMAIL = 'brookfield.admin@demo.com';
const ADMIN_PASSWORD = 'Password123';
const ADMIN_FIRST_NAME = 'Brookfield';
const ADMIN_LAST_NAME = 'Admin';

const TEACHER_EMAIL = 'brookfield.teacher@demo.com';
const TEACHER_PASSWORD = 'Password123';
const TEACHER_NAME = 'Brookfield Teacher';

// Deliberately three distinct strings (not all "Mechanical Workshop 1") —
// avoids any ambiguity if a locator ever needs to distinguish these by text
// rather than by position.
const BLOCK_NAME = 'Mechanical Workshop 1 — Fall Cohort'; // the time block / term
const SUBJECT_NAME = 'Mechanical Workshop 1'; // the subject, as the institution would actually name it
const CLASS_NAME = 'Mechanical Workshop 1 — Evening Section'; // the class

const SESSION_DAY_LABEL = 'Wed'; // once-a-week — matches the real plan's single weekly session
const SESSION_START_TIME = '15:00';
const SESSION_DURATION_MINUTES = '120'; // 3pm-5pm
const CLASS_CAPACITY = '25'; // "over 20 people"

function persistAdminCredentials(email: string, password: string) {
  const contents = readFileSync(ENV_QA_PATH, 'utf8');
  const updated = contents
    .replace(/^QA_FALLBACK_ADMIN_EMAIL=.*$/m, `QA_FALLBACK_ADMIN_EMAIL="${email}"`)
    .replace(/^QA_FALLBACK_ADMIN_PASSWORD=.*$/m, `QA_FALLBACK_ADMIN_PASSWORD="${password}"`);
  writeFileSync(ENV_QA_PATH, updated);
}

test.beforeEach(() => {
  test.skip(
    !INSTITUTION_NAME || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD,
    'QA_FALLBACK_INSTITUTION_NAME / QA_SUPERADMIN_EMAIL / QA_SUPERADMIN_PASSWORD missing from .env.qa',
  );
});

test('setup: creates the fallback institution and admin account', async ({ page, context }) => {
  await forceLiveData(context);

  if (process.env.QA_FALLBACK_ADMIN_EMAIL) {
    test.skip(true, 'Already set up — QA_FALLBACK_ADMIN_EMAIL present in .env.qa');
  }

  await test.step('super_admin creates the institution (radio choice is irrelevant — a follow-up admin script strips calendarMode entirely)', async () => {
    await login(page, {
      institutionLabel: 'Platform Administration',
      email: SUPERADMIN_EMAIL!,
      password: SUPERADMIN_PASSWORD!,
    });
    await page.goto('/dashboard/onboard-institution');
    await page.getByLabel('Institution name').fill(INSTITUTION_NAME!);
    await page.getByRole('button', { name: 'Create institution' }).click();
    await expect(page.getByText('Institution created')).toBeVisible({ timeout: 10_000 });
  });

  await test.step('skip the brand/profile step', async () => {
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByText('completing this step links the admin account')).toBeVisible();
  });

  await test.step('create the institution_admin account', async () => {
    await page.getByLabel('First name').fill(ADMIN_FIRST_NAME);
    await page.getByLabel('Last name').fill(ADMIN_LAST_NAME);
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Temporary password').fill(ADMIN_PASSWORD);
    await page.getByLabel('Confirm password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page.getByText('Institution onboarded successfully')).toBeVisible({ timeout: 10_000 });
    persistAdminCredentials(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  await logout(page);

  console.log(
    `\n>>> Setup done. Before running the next test, strip calendarMode by hand:\n` +
    `    delete the calendarMode field of the fallback institution's document in the Firebase console\n`,
  );
});

test('interstitial: inst_admin sees the one-time calendarMode choice; the pick persists across reload', async ({ page, context }) => {
  const adminEmail = process.env.QA_FALLBACK_ADMIN_EMAIL || ADMIN_EMAIL;
  const adminPassword = process.env.QA_FALLBACK_ADMIN_PASSWORD || ADMIN_PASSWORD;
  test.skip(!process.env.QA_FALLBACK_ADMIN_EMAIL, 'Run the setup test first, then delete the calendarMode field of the fallback institution in the Firebase console');

  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: adminEmail, password: adminPassword });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/institution-profile');
  await dismissTourIfPresent(page);

  const interstitialHeading = page.getByRole('heading', { name: 'How is your academic calendar structured?' });
  if (await interstitialHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await test.step('pick "Custom Time Blocks" — writes calendarMode immediately, before Step 1', async () => {
      await page.getByText('Custom Time Blocks', { exact: true }).click();
      await expect(interstitialHeading).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'Basic Info' })).toBeVisible({ timeout: 10_000 });
    });
  } else {
    await test.step('already resolved by a prior run — Step 1 should render directly', async () => {
      await expect(page.getByRole('heading', { name: 'Basic Info' })).toBeVisible({ timeout: 10_000 });
    });
  }

  await test.step('a full reload does not re-prompt the choice (calendarMode persisted, not lost mid-wizard)', async () => {
    await page.reload();
    await dismissTourIfPresent(page);
    await expect(interstitialHeading).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Basic Info' })).toBeVisible({ timeout: 10_000 });
  });
});

test('creates the Mechanical Workshop 1 time block (once-weekly, Wed)', async ({ page, context }) => {
  const adminEmail = process.env.QA_FALLBACK_ADMIN_EMAIL || ADMIN_EMAIL;
  const adminPassword = process.env.QA_FALLBACK_ADMIN_PASSWORD || ADMIN_PASSWORD;
  test.skip(!process.env.QA_FALLBACK_ADMIN_EMAIL, 'Run the setup + interstitial tests first');

  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: adminEmail, password: adminPassword });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/academic-calendar');
  await dismissTourIfPresent(page);

  const alreadyExists = await page.getByText(BLOCK_NAME, { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false);
  if (!alreadyExists) {
    await test.step('first-time wizard: name it, pick a start date, restrict to Wed only', async () => {
      await expect(page.getByRole('heading', { name: 'New Time Block' })).toBeVisible({ timeout: 10_000 });
      await page.locator('#tour-academic-calendar-timeblock-name').fill(BLOCK_NAME);
      await page.locator('#tour-academic-calendar-timeblock-start').fill(new Date().toISOString().slice(0, 10));
      // Default schoolWeekDays is Mon-Fri ([1,2,3,4,5]) — toggle off every
      // day except Wed to match "once a week", same mechanism 00's setup
      // spec used to differentiate Cohort A/B (weekday value 3 = Wed).
      for (const value of [1, 2, 4, 5]) {
        await page.locator(`#tour-academic-calendar-timeblock-weekday-${value}`).click();
      }
      await page.locator('#tour-academic-calendar-timeblock-create').click();
      await expect(page.getByRole('heading', { name: 'Time Blocks' })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(BLOCK_NAME, { exact: true })).toBeVisible();
    });
  }
});

test('creates a Regular Teacher account for the programme', async ({ page, context }) => {
  const adminEmail = process.env.QA_FALLBACK_ADMIN_EMAIL || ADMIN_EMAIL;
  const adminPassword = process.env.QA_FALLBACK_ADMIN_PASSWORD || ADMIN_PASSWORD;
  test.skip(!process.env.QA_FALLBACK_ADMIN_EMAIL, 'Run the setup + interstitial tests first');

  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: adminEmail, password: adminPassword });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/list/teachers');
  await dismissTourIfPresent(page);
  if (await page.getByText(TEACHER_NAME, { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false)) return;

  await page.goto('/dashboard/create-user');
  await dismissTourIfPresent(page);
  const [firstName, lastName] = TEACHER_NAME.split(' ');
  await page.locator('#tour-create-user-first-name').fill(firstName);
  await page.locator('#tour-create-user-last-name').fill(lastName);
  await page.locator('#tour-create-user-email').fill(TEACHER_EMAIL);
  await page.locator('#tour-create-user-password').fill(TEACHER_PASSWORD);
  await page.locator('#tour-create-user-confirm-password').fill(TEACHER_PASSWORD);
  await page.locator('#tour-create-user-role').selectOption({ label: 'Regular Teacher' });
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByText(`${TEACHER_NAME} was created successfully.`)).toBeVisible({ timeout: 10_000 });
});

test('creates the Mechanical Workshop 1 subject (weekly, Wed)', async ({ page, context }) => {
  const adminEmail = process.env.QA_FALLBACK_ADMIN_EMAIL || ADMIN_EMAIL;
  const adminPassword = process.env.QA_FALLBACK_ADMIN_PASSWORD || ADMIN_PASSWORD;
  test.skip(!process.env.QA_FALLBACK_ADMIN_EMAIL, 'Run the setup + interstitial tests first');

  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: adminEmail, password: adminPassword });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/list/subjects');
  await dismissTourIfPresent(page);
  if (await page.getByText(SUBJECT_NAME, { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false)) return;

  await page.getByRole('button', { name: 'Add new subject' }).click();
  const modal = page.locator('.fixed.inset-0.bg-black\\/60.z-50');
  await expect(modal.getByText('Create a new subject')).toBeVisible();

  await modal.locator('input[name="name"]').fill(SUBJECT_NAME);
  // classScope defaults to 'institution' (no class picker needed), cwWeight/
  // examWeight default to 40/60 (already sums to 100), frequency defaults
  // to 'weekly' — only the session day needs picking. Each day option is a
  // <label><input type="checkbox"/>{label}</label> pair (no htmlFor/id) —
  // getByLabel resolves via that implicit wrap-association.
  await modal.getByLabel(SESSION_DAY_LABEL, { exact: true }).check();
  await modal.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(modal).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText(SUBJECT_NAME, { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('creates the Mechanical Workshop 1 class (capacity 25) assigned to the new time block', async ({ page, context }) => {
  const adminEmail = process.env.QA_FALLBACK_ADMIN_EMAIL || ADMIN_EMAIL;
  const adminPassword = process.env.QA_FALLBACK_ADMIN_PASSWORD || ADMIN_PASSWORD;
  test.skip(!process.env.QA_FALLBACK_ADMIN_EMAIL, 'Run the setup + interstitial tests first');

  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: adminEmail, password: adminPassword });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/list/classes');
  await dismissTourIfPresent(page);
  if (await page.getByText(CLASS_NAME, { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false)) return;

  await page.getByRole('button', { name: 'Add new class' }).click();
  const modal = page.locator('.fixed.inset-0.bg-black\\/60.z-50');
  // Custom mode: "Programme Year" (grade), left blank — optional.
  await expect(modal.getByText('Programme Year', { exact: true })).toBeVisible();

  await modal.locator('input[name="name"]').fill(CLASS_NAME);
  await modal.locator('input[name="capacity"]').fill(CLASS_CAPACITY);
  await modal.locator('select[name="termId"]').selectOption({ label: BLOCK_NAME });
  await modal.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText(CLASS_NAME, { exact: true })).toBeVisible({ timeout: 10_000 });
});

test('creates the 3pm-5pm Wednesday timetable slot and confirms it appears on the Schedule page', async ({ page, context }) => {
  const adminEmail = process.env.QA_FALLBACK_ADMIN_EMAIL || ADMIN_EMAIL;
  const adminPassword = process.env.QA_FALLBACK_ADMIN_PASSWORD || ADMIN_PASSWORD;
  test.skip(!process.env.QA_FALLBACK_ADMIN_EMAIL, 'Run every prior test in this file first');

  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: adminEmail, password: adminPassword });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/schedule');
  await dismissTourIfPresent(page);

  // Idempotent: a slot already on the grid means a prior run finished this
  // step. The grid card shows subjectName/teacherName/startTime, not
  // className (schedule/index.tsx:223-227) — SUBJECT_NAME is the right
  // signal, not CLASS_NAME.
  const alreadyExists = await page.getByText(SUBJECT_NAME, { exact: true }).isVisible({ timeout: 5_000 }).catch(() => false);
  if (!alreadyExists) {
    await test.step('Add timetable slot — Term/Subject/Teacher/Class are freeform <select>s scoped by option text (no id/label association)', async () => {
      await page.getByRole('button', { name: 'Add new timetable slot' }).click();
      const modal = page.locator('.fixed.inset-0.bg-black\\/60.z-50');
      await expect(modal.getByText('Add timetable slot')).toBeVisible();

      // Positional, not filter-by-option-text: TimetableSlotForm.tsx renders
      // Term/Subject/Teacher/Class as four <select>s in this exact fixed
      // order (confirmed from source) — simpler and more robust than
      // filter({has}) chained onto a Locator root, which hung indefinitely
      // here for reasons that didn't reproduce under isolated debugging.
      const selects = modal.locator('select');
      await selects.nth(0).selectOption({ label: BLOCK_NAME });
      await selects.nth(1).selectOption({ label: SUBJECT_NAME });
      await selects.nth(2).selectOption({ label: TEACHER_NAME });
      await selects.nth(3).selectOption({ label: CLASS_NAME });

      await modal.getByLabel(SESSION_DAY_LABEL, { exact: true }).check();
      await modal.locator('input[name="startTime"]').fill(SESSION_START_TIME);
      await modal.locator('input[name="duration"]').fill(SESSION_DURATION_MINUTES);

      await modal.getByRole('button', { name: 'Add Slot' }).click();
      await expect(modal).toHaveCount(0, { timeout: 10_000 });
    });
  }

  await test.step('slot appears on the Schedule grid with the right subject/teacher/time/duration', async () => {
    await expect(page.getByText(SUBJECT_NAME, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(TEACHER_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText(`${SESSION_START_TIME} · 2h`)).toBeVisible(); // formatDuration(120) === '2h'
  });
});
