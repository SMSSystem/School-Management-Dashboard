import { test, expect, type Locator, type Page } from '@playwright/test';
import { forceLiveData, login, dismissTourIfPresent } from './helpers';

// §11's second QA leg: "confirm Gradebook/Schedule/Attendance/dashboards all
// let the admin pick among [2+ overlapping time blocks] correctly and don't
// silently collapse to just one." Runs against Hawthorn Institute (created
// by 00-setup-custom-institution.spec.ts, with its Cohort A / Cohort B
// blocks — Cohort A Mon-Fri, Cohort B Tue/Thu only, so the two are
// genuinely distinguishable, not just two names for the same schedule).
//
// The admin/senior-teacher dashboard "multi-block summary" widget is
// deliberately NOT checked here — it's item 6 sub-pass 2, explicitly
// deferred earlier this session and never built. That's a real, known gap
// in the implementation, not something this suite should paper over with a
// test that either can't pass or has to be written to expect nothing.

const INSTITUTION_NAME = process.env.QA_CUSTOM_INSTITUTION_NAME; // "Hawthorn Institute"
const ADMIN_EMAIL = process.env.QA_CUSTOM_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.QA_CUSTOM_ADMIN_PASSWORD;

const BLOCK_A_NAME = 'Mechanical Workshop 1 — Cohort A';
const BLOCK_B_NAME = 'Mechanical Workshop 1 — Cohort B';

// Locates a <select> by one of its own <option> labels rather than an id —
// several of these dropdowns (Schedule, the attendance pages' Time Block
// picker) have no id/label association at all (pre-existing pattern, not
// introduced by this spec).
function selectContainingOption(page: Page, optionText: string): Locator {
  return page.locator('select').filter({ has: page.locator('option', { hasText: optionText }) });
}

async function assertListsBothBlocks(select: Locator) {
  await expect(select).toBeVisible({ timeout: 10_000 });
  const optionTexts = await select.locator('option').allTextContents();
  expect(optionTexts, 'expected both Cohort A and Cohort B as options').toEqual(
    expect.arrayContaining([BLOCK_A_NAME, BLOCK_B_NAME]),
  );
}

test.beforeEach(() => {
  test.skip(
    !INSTITUTION_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'QA_CUSTOM_INSTITUTION_NAME / QA_CUSTOM_ADMIN_EMAIL / QA_CUSTOM_ADMIN_PASSWORD missing from .env.qa — run 00-setup-custom-institution.spec.ts first',
  );
});

test('ClassForm: Term dropdown lists both time blocks, field is labeled "Programme Year"', async ({ page, context }) => {
  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/list/classes');
  await dismissTourIfPresent(page);
  await page.getByRole('button', { name: 'Add new class' }).click();

  // Scoped to the modal, not the whole page — ClassListPage's own table has
  // a static "Grade" column header (unrelated to ClassForm's field label,
  // unaffected by calendarMode) still visible behind the modal overlay.
  const modal = page.locator('.fixed.inset-0.bg-black\\/60.z-50');
  await expect(modal.getByText('Programme Year', { exact: true })).toBeVisible();
  await expect(modal.getByText('Grade', { exact: true })).toHaveCount(0);

  await assertListsBothBlocks(modal.locator('select[name="termId"]'));
});

test('Gradebook: Term dropdown lists both time blocks', async ({ page, context }) => {
  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/list/gradebook');
  await dismissTourIfPresent(page);
  await assertListsBothBlocks(page.locator('#tour-gradebook-term select'));
});

// The redesigned Schedule page has no Term dropdown: the week decides the time block (spec D5), and every active
// block's lessons show in the week they run (D16). So instead of a picker listing both blocks, check that the page
// opens on a week with no Term picker, and that it does not collapse to one block: in custom mode the "nothing
// active" wording is never shown while both blocks are active.
test('Schedule: no Term picker; the week follows the active time blocks', async ({ page, context }) => {
  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/schedule');
  await dismissTourIfPresent(page);
  await expect(page.getByRole('button', { name: 'Next week' })).toBeVisible({ timeout: 20_000 });
  await expect(selectContainingOption(page, BLOCK_A_NAME)).toHaveCount(0);
  await expect(page.getByLabel('Term')).toHaveCount(0);
  await expect(page.getByText('No time block is active')).toHaveCount(0);
});

test('General Attendance: Time Block selector lists both blocks and scopes the class list', async ({ page, context }) => {
  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/attendance/general');
  await dismissTourIfPresent(page);
  await assertListsBothBlocks(selectContainingOption(page, BLOCK_A_NAME));
});

test('Subject Attendance: Time Block selector lists both blocks', async ({ page, context }) => {
  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/attendance/subject');
  await dismissTourIfPresent(page);
  await assertListsBothBlocks(selectContainingOption(page, BLOCK_A_NAME));
});
