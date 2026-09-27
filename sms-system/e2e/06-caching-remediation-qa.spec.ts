import { test, expect, type Page } from '@playwright/test';
import { forceLiveData, login, dismissTourIfPresent } from './helpers';

// Exercises the "Functional regression" and "Staleness check" legs of
// internal/custom-calendar-related/USE_INSTITUTION_ACADEMIC_CALENDAR_CACHING_REMEDIATION_PLAN.md
// §7 (the "Automated" leg is just re-running e2e/00-05 alongside this file —
// nothing new to build there). The plan's third leg ("Manual, before/after
// read-count spot check") needs the Firebase Console's Usage tab and isn't
// automatable, so it's deliberately not attempted here.
//
// Runs against Hawthorn Institute (created by
// 00-setup-custom-institution.spec.ts) — reuses its Cohort A / Cohort B
// fixture, which is already differentiated enough (Cohort A created first,
// Cohort B second, both currently active) to make sort order a genuine,
// non-coincidental assertion: alphabetical order would put Cohort A first,
// so Cohort B actually appearing first is real signal that the hook is
// sorting by createdAt desc, not by insertion/alphabetical order.
//
// Not attempted: forcing the soonest-ending tie-break (§3 of
// CUSTOM_CALENDAR_MODE_SPEC.md — applies only when two blocks share the
// exact same createdAt instant). Two sequential UI-driven writes against a
// live Firestore backend never land on the same millisecond in practice, so
// there's no reliable way to force that branch through the UI; the
// comparator's logic itself is unchanged from before this hook's react-query
// conversion (see useInstitutionAcademicCalendar.ts's activeTimeBlocks
// useMemo), so this is a pre-existing, already-covered code path, not new
// risk introduced by this remediation.

const INSTITUTION_NAME = process.env.QA_CUSTOM_INSTITUTION_NAME;
const ADMIN_EMAIL = process.env.QA_CUSTOM_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.QA_CUSTOM_ADMIN_PASSWORD;

const BLOCK_A_NAME = 'Mechanical Workshop 1 — Cohort A'; // created first
const BLOCK_B_NAME = 'Mechanical Workshop 1 — Cohort B'; // created second — should sort first
const THIRD_BLOCK_NAME = 'QA Staleness Check Block';

test.beforeEach(() => {
  test.skip(
    !INSTITUTION_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'QA_CUSTOM_INSTITUTION_NAME / QA_CUSTOM_ADMIN_EMAIL / QA_CUSTOM_ADMIN_PASSWORD missing from .env.qa — run 00-setup-custom-institution.spec.ts first',
  );
});

// Time Blocks summary view (CustomTimeBlocksSummaryView) renders
// `blocks.map(...)` with no client-side re-sort — each block's name is a
// <p className="text-sm font-semibold ..."> — so this list's DOM order is
// exactly activeTimeBlocks' own order.
async function summaryBlockOrder(page: Page): Promise<string[]> {
  return page.locator('p.text-sm.font-semibold', { hasText: /Mechanical Workshop|QA Staleness/ }).allTextContents();
}

// ClassForm's Term <select> also renders sortedTerms (== activeTimeBlocks in
// custom mode) with no re-sort (src/components/forms/ClassForm.tsx:51-55) —
// same order-preservation property, different consumer.
async function classFormTermOrder(page: Page): Promise<string[]> {
  await page.goto('/dashboard/list/classes');
  await dismissTourIfPresent(page);
  await page.getByRole('button', { name: 'Add new class' }).click();
  const modal = page.locator('.fixed.inset-0.bg-black\\/60.z-50');
  const select = modal.locator('select[name="termId"]');
  await expect(select).toBeVisible({ timeout: 10_000 });
  const options = await select.locator('option').allTextContents();
  return options.filter((o) => o !== 'Select a term' && o !== 'Loading terms…');
}

function assertBeforeOtherOrAbsent(names: string[], first: string, second: string) {
  const iFirst = names.indexOf(first);
  const iSecond = names.indexOf(second);
  expect(iFirst, `expected "${first}" to be present`).toBeGreaterThanOrEqual(0);
  expect(iSecond, `expected "${second}" to be present`).toBeGreaterThanOrEqual(0);
  expect(iFirst, `expected "${first}" to sort before "${second}"`).toBeLessThan(iSecond);
}

test('Functional regression: activeTimeBlocks sorts most-recently-created first', async ({ page, context }) => {
  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await test.step('Academic Calendar "Time Blocks" summary lists Cohort B before Cohort A', async () => {
    await page.goto('/dashboard/academic-calendar');
    await dismissTourIfPresent(page);
    await expect(page.getByRole('heading', { name: 'Time Blocks' })).toBeVisible({ timeout: 10_000 });
    const names = await summaryBlockOrder(page);
    assertBeforeOtherOrAbsent(names, BLOCK_B_NAME, BLOCK_A_NAME);
  });

  await test.step('ClassForm Term dropdown lists Cohort B before Cohort A', async () => {
    const names = await classFormTermOrder(page);
    assertBeforeOtherOrAbsent(names, BLOCK_B_NAME, BLOCK_A_NAME);
  });
});

test('Staleness: a newly-created time block appears immediately, without a reload', async ({ page, context }) => {
  await forceLiveData(context);
  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/academic-calendar');
  await dismissTourIfPresent(page);
  await expect(page.getByRole('heading', { name: 'Time Blocks' })).toBeVisible({ timeout: 10_000 });

  // Idempotent, same convention as 00-setup-custom-institution.spec.ts —
  // branches on actual page state so a re-run doesn't fail on "already
  // exists" or create duplicates.
  const alreadyExists = await page.getByText(THIRD_BLOCK_NAME, { exact: true }).isVisible().catch(() => false);
  if (!alreadyExists) {
    await test.step('create a third time block via the quick-create modal', async () => {
      await page.getByRole('button', { name: '+ New Time Block' }).click();
      const modal = page.locator('.fixed.inset-0.z-50');
      await expect(modal.getByText('Pre-filled from')).toBeVisible();
      await modal.getByLabel('Name').fill(THIRD_BLOCK_NAME);
      await modal.getByRole('button', { name: 'Create' }).click();
      await expect(modal).toHaveCount(0, { timeout: 10_000 });
    });
  }

  await test.step('appears immediately in the Academic Calendar summary — same mounted hook instance, no reload', async () => {
    // Remediation plan §5 rows for CustomTimeBlockWizard.confirm() /
    // QuickTimeBlockModal.confirm() — invalidates ['academicYears',
    // institutionId] and ['terms', institutionId], which this page's own
    // useInstitutionAcademicCalendar() instance is subscribed to.
    await expect(page.getByText(THIRD_BLOCK_NAME, { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  await test.step('appears immediately in ClassForm\'s Term dropdown on a freshly-mounted page — client-side nav, no reload', async () => {
    // getByRole('link', ...).click() drives react-router's client-side
    // navigation (Menu.tsx's NavLink), not a full browser reload — unlike
    // page.goto(), which always forces one. This is the genuine "same
    // session, no reload" proof the plan's Staleness check calls for: before
    // the fix, ClassForm's own useInstitutionAcademicCalendar() mount here
    // would have served the ['terms', institutionId] query's still-cached,
    // pre-creation data straight from the 60s staleTime window.
    await page.getByRole('link', { name: 'Classes', exact: true }).click();
    await dismissTourIfPresent(page);
    await page.getByRole('button', { name: 'Add new class' }).click();
    const modal = page.locator('.fixed.inset-0.bg-black\\/60.z-50');
    const select = modal.locator('select[name="termId"]');
    await expect(select).toBeVisible({ timeout: 10_000 });
    await expect(select.locator('option', { hasText: THIRD_BLOCK_NAME })).toHaveCount(1, { timeout: 10_000 });
  });
});
