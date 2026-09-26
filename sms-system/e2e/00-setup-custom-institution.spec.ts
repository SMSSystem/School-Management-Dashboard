import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { forceLiveData, login, logout, todayISO, dismissTourIfPresent } from './helpers';

// Setup spec for CUSTOM_CALENDAR_MODE_SPEC.md §11's "New custom-mode
// institution: create 2+ overlapping time blocks" leg. Everything else in
// the QA plan that needs a real calendarMode: 'custom' institution builds on
// what this spec creates, so it's deliberately the first (and, for now,
// only) spec in the suite — see this session's own "setup first, confirm,
// then the rest" decision.
//
// Idempotent at two independent levels, so a partial failure never needs
// manual cleanup before re-running:
//   - Institution/admin creation: skipped if QA_CUSTOM_ADMIN_EMAIL is
//     already set in .env.qa (written by a prior successful run of that step).
//   - Time block creation: branches on the Academic Calendar page's actual
//     rendered state (the first-time wizard vs. the summary view, and
//     whether block B is already listed), not on a flag — so a run that
//     created block A but crashed before block B still resumes correctly.

const ENV_QA_PATH = '.env.qa';

const INSTITUTION_NAME = process.env.QA_CUSTOM_INSTITUTION_NAME;
const SUPERADMIN_EMAIL = process.env.QA_SUPERADMIN_EMAIL;
const SUPERADMIN_PASSWORD = process.env.QA_SUPERADMIN_PASSWORD;

const ADMIN_EMAIL = 'hawthorn.admin@demo.com';
const ADMIN_PASSWORD = 'Password123';
const ADMIN_FIRST_NAME = 'Hawthorn';
const ADMIN_LAST_NAME = 'Admin';

const BLOCK_A_NAME = 'Mechanical Workshop 1 — Cohort A';
const BLOCK_B_NAME = 'Mechanical Workshop 1 — Cohort B';

function persistAdminCredentials(email: string, password: string) {
  const contents = readFileSync(ENV_QA_PATH, 'utf8');
  const updated = contents
    .replace(/^QA_CUSTOM_ADMIN_EMAIL=.*$/m, `QA_CUSTOM_ADMIN_EMAIL="${email}"`)
    .replace(/^QA_CUSTOM_ADMIN_PASSWORD=.*$/m, `QA_CUSTOM_ADMIN_PASSWORD="${password}"`);
  writeFileSync(ENV_QA_PATH, updated);
}

test('creates a calendarMode: custom institution with 2 overlapping time blocks', async ({ page, context }) => {
  test.skip(!INSTITUTION_NAME || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD,
    'QA_CUSTOM_INSTITUTION_NAME / QA_SUPERADMIN_EMAIL / QA_SUPERADMIN_PASSWORD missing from .env.qa');

  await forceLiveData(context);

  const alreadySetUp = !!process.env.QA_CUSTOM_ADMIN_EMAIL;

  if (!alreadySetUp) {
    await test.step('super_admin creates the institution (Custom Time Blocks mode)', async () => {
      await login(page, {
        institutionLabel: 'Platform Administration',
        email: SUPERADMIN_EMAIL!,
        password: SUPERADMIN_PASSWORD!,
      });
      await page.goto('/dashboard/onboard-institution');

      await page.getByLabel('Institution name').fill(INSTITUTION_NAME!);
      // Two radios share overlapping label text ("Academic Year" vs "Custom
      // Time Blocks" descriptions both mention "school year"/"time blocks"),
      // so target the input by its value rather than getByLabel.
      await page.locator('input[type="radio"][value="custom"]').check();
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

    await test.step('log out of the super_admin session', async () => {
      await logout(page);
    });
  }

  const adminEmail = process.env.QA_CUSTOM_ADMIN_EMAIL || ADMIN_EMAIL;
  const adminPassword = process.env.QA_CUSTOM_ADMIN_PASSWORD || ADMIN_PASSWORD;

  await test.step('institution_admin logs in and opens the Academic Calendar', async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: adminEmail,
      password: adminPassword,
    });
    await dismissTourIfPresent(page);
    // page.goto is a hard navigation (full reload, not client-side
    // react-router routing) — remounts the whole app including
    // TourAutoTrigger, which can re-fire if the Skip Tour click's own
    // markTourSeen() write hadn't landed in Firestore before the reload
    // cancelled it. Dismissing again after is cheap and a no-op once the
    // write has actually gone through.
    await page.goto('/dashboard/academic-calendar');
    await dismissTourIfPresent(page);
  });

  // Branches on actual page state rather than the alreadySetUp flag above —
  // that flag only tells us the institution/admin account exists, not how
  // far a previous, partially-failed run got through block creation. Safe
  // to re-run from any point: the wizard only ever shows with zero blocks,
  // and the summary view lists however many genuinely exist.
  const wizardHeading = page.getByRole('heading', { name: 'New Time Block' });
  if (await wizardHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await test.step('create the first time block (New Time Block wizard)', async () => {
      await page.locator('#tour-academic-calendar-timeblock-name').fill(BLOCK_A_NAME);
      await page.locator('#tour-academic-calendar-timeblock-start').fill(todayISO());
      // Duration mode ("By duration"), count (10) and unit (weeks) all keep
      // their component defaults — matches the spec's own "fixed 10-week
      // basis" example exactly, so nothing else needs changing here.
      await page.locator('#tour-academic-calendar-timeblock-create').click();

      await expect(page.getByRole('heading', { name: 'Time Blocks' })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(BLOCK_A_NAME, { exact: true })).toBeVisible();
    });
  }

  await expect(page.getByRole('heading', { name: 'Time Blocks' })).toBeVisible({ timeout: 10_000 });
  if (!(await page.getByText(BLOCK_B_NAME, { exact: true }).isVisible().catch(() => false))) {
    await test.step('create a second, overlapping time block (quick-create)', async () => {
      await page.getByRole('button', { name: '+ New Time Block' }).click();
      const modal = page.locator('.fixed.inset-0.z-50');
      await expect(modal.getByText('Pre-filled from')).toBeVisible();

      await modal.getByLabel('Name').fill(BLOCK_B_NAME);
      // Overlap is the whole point of this leg (§11: "create 2+ overlapping
      // time blocks") — the quick-create modal defaults to starting the day
      // after the reference block ends, which would NOT overlap, so this
      // explicitly overrides it back to block A's own start date instead.
      await modal.getByLabel('Start date').fill(todayISO());
      // Deliberately different session days from Cohort A (which keeps its
      // Mon–Fri default) — the modal pre-fills Cohort A's own Mon–Fri, so
      // toggle Mon/Wed/Fri off, leaving Tue/Thu. Without this, §11's
      // attendance leg (isSchoolDay independent per block) would have
      // nothing to actually distinguish between the two blocks.
      await modal.getByRole('button', { name: 'Mon', exact: true }).click();
      await modal.getByRole('button', { name: 'Wed', exact: true }).click();
      await modal.getByRole('button', { name: 'Fri', exact: true }).click();
      await modal.getByRole('button', { name: 'Create' }).click();

      await expect(modal).toHaveCount(0, { timeout: 10_000 });
    });
  }

  await test.step('verify both time blocks are listed as active and overlapping', async () => {
    await expect(page.getByRole('heading', { name: 'Time Blocks' })).toBeVisible();
    await expect(page.getByText(BLOCK_A_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText(BLOCK_B_NAME, { exact: true })).toBeVisible();
    // Both blocks share the same start date (today) by construction above —
    // confirms they're genuinely concurrent, not just both merely "active".
    const dateRanges = await page.locator('p.text-xs.text-gray-500', { hasText: '→' }).allTextContents();
    expect(dateRanges.length).toBeGreaterThanOrEqual(2);
    const startDates = dateRanges.map((r) => r.split('→')[0].trim());
    expect(new Set(startDates).size).toBe(1);
  });
});
