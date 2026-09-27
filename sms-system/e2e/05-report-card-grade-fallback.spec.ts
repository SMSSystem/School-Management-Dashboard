import { test, expect } from '@playwright/test';
import { forceLiveData, login, dismissTourIfPresent } from './helpers';

// §11's fifth QA leg: "Report card / report builder / spreadsheet import:
// confirm all handle a class with no grade set without erroring."
//
// Scaled to a minimal crash check per this session's own decision: static
// analysis (this session and the prior one) already confirmed none of
// generateReportCard.ts / generateProgressReport.ts / import/index.tsx /
// spreadsheetExport.ts reference ClassDocument.grade at all — there's no
// grade-based branch to actually exercise. reports/builder/index.tsx is the
// one exception — it explicitly guards `c.grade` being undefined already
// (its own comment cites this spec directly), which this checks holds up
// against a real gradeless class rather than just trusting the comment.
//
// Reuses "QA Cohort A Class" — created by 03-attendance-session-validity.spec.ts
// with Programme Year (grade) deliberately left blank, per its own fixture
// comment. Doesn't generate an actual report card: that student has no
// gradebook results, so generateReportCard() would correctly (and
// unrelatedly to grade) return "No results found for this student in the
// selected term" — a real, expected error this check has no reason to
// trigger.

const INSTITUTION_NAME = process.env.QA_CUSTOM_INSTITUTION_NAME;
const ADMIN_EMAIL = process.env.QA_CUSTOM_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.QA_CUSTOM_ADMIN_PASSWORD;
const GRADELESS_CLASS_NAME = 'QA Cohort A Class';

test.beforeEach(() => {
  test.skip(
    !INSTITUTION_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    'QA_CUSTOM_INSTITUTION_NAME / QA_CUSTOM_ADMIN_EMAIL / QA_CUSTOM_ADMIN_PASSWORD missing from .env.qa — run 00-setup-custom-institution.spec.ts first',
  );
});

test('Report Cards: gradeless class is selectable in the batch-generate panel without crashing', async ({
  page,
  context,
}) => {
  await forceLiveData(context);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/report-cards');
  await dismissTourIfPresent(page);
  await page.getByTitle('Generate Report Card').click();
  await page.getByRole('button', { name: 'Batch (Class)' }).click();

  const classSelect = page.locator('select').filter({ has: page.locator('option', { hasText: GRADELESS_CLASS_NAME }) });
  await expect(classSelect).toBeVisible({ timeout: 10_000 });
  await classSelect.selectOption({ label: GRADELESS_CLASS_NAME });

  expect(pageErrors, `Uncaught page error(s): ${pageErrors.join(' | ')}`).toEqual([]);
});

test('Report Builder: loads without crashing for a term that includes a gradeless class', async ({ page, context }) => {
  await forceLiveData(context);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/reports/builder');
  await dismissTourIfPresent(page);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  expect(pageErrors, `Uncaught page error(s): ${pageErrors.join(' | ')}`).toEqual([]);
});

test('Spreadsheet Import: loads without crashing for the custom-mode institution', async ({ page, context }) => {
  await forceLiveData(context);
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
  await dismissTourIfPresent(page);

  await page.goto('/dashboard/import');
  await dismissTourIfPresent(page);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

  expect(pageErrors, `Uncaught page error(s): ${pageErrors.join(' | ')}`).toEqual([]);
});
