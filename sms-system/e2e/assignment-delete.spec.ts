import { test, expect } from '@playwright/test';
import { forceLiveData, login, logout, dismissTourIfPresent } from './helpers';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  CLASS_A_NAME,
  INSTITUTION_NAME,
  TEACHER_EMAIL,
  TEACHER_PASSWORD,
  assignmentLeftovers,
  assignmentRow,
  createAssignmentAsTeacher,
  deleteQaResults,
  ensurePastChangePassword,
  openAssignment,
  submissionExists,
  waitForSavedSubmission,
} from './assignments-workflow-support';

// Deleting an assignment deletes its students' submissions, their attempts and the tombstones, and keeps the grade
// (src/lib/assignmentDelete.ts, ISSUES_AND_GAPS #85). Needs the rules deployed with that change. Uses spec 08's QA
// class, teacher, admin and assignments student; run spec 08's fixtures test first on a fresh QA institution.

const TITLE = 'QA Delete Cascade Assignment';
const DUE_OFFSET = 6;
const TEST_PDF_PATH = 'e2e/.fixtures/qa-submission.pdf';
const STUDENT_EMAIL = process.env.QA_ASSIGNMENTS_STUDENT_EMAIL;
const STUDENT_PASSWORD = process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD;

test('deleting a graded assignment removes the submissions, attempts and tombstones and keeps the grade', async ({ page, context }) => {
  test.skip(!INSTITUTION_NAME || !TEACHER_EMAIL || !ADMIN_EMAIL || !STUDENT_EMAIL, 'QA_* credentials missing from .env.qa');
  test.setTimeout(240_000);
  await forceLiveData(context);
  let assignmentId = '';

  await test.step('a teacher creates a published, standalone assignment', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await createAssignmentAsTeacher(page, {
      title: TITLE,
      className: CLASS_A_NAME,
      dueDateOffsetDays: DUE_OFFSET,
      type: 'Homework',
      status: 'Published',
      gradingMode: 'standalone',
    });
    await logout(page);
  });

  await test.step('the student submits', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: STUDENT_EMAIL!, password: STUDENT_PASSWORD! });
    await ensurePastChangePassword(page, STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, DUE_OFFSET);
    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 10_000 });
    assignmentId = page.url().split('/dashboard/list/assignments/')[1];
    if (!(await submissionExists(page, STUDENT_EMAIL!))) {
      await page.locator('input[type="file"]').setInputFiles(TEST_PDF_PATH);
      await expect(page.getByText('Submitted', { exact: true })).toBeVisible({ timeout: 15_000 });
      await waitForSavedSubmission(page, STUDENT_EMAIL!);
    }
    await logout(page);
  });

  await test.step('the teacher grades it, which writes a result', async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, DUE_OFFSET);
    const gradeButton = page.getByRole('button', { name: /^(Grade|Re-grade)$/ });
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await gradeButton.isVisible({ timeout: 8_000 }).catch(() => false)) break;
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await gradeButton.click();
    await page.locator('xpath=//label[normalize-space(text())="Score"]/following-sibling::input[1]').fill('7');
    await page.locator('xpath=//label[normalize-space(text())="Max Score"]/following-sibling::input[1]').fill('10');
    await page.getByRole('button', { name: 'Save Grade', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Grade —/ })).toHaveCount(0, { timeout: 10_000 });
    await expect.poll(async () => (await assignmentLeftovers(assignmentId, STUDENT_EMAIL!))?.results ?? 1, { timeout: 30_000 }).toBeGreaterThan(0);
    await logout(page);
  });

  await test.step('the admin sees the counts in the delete dialog and deletes it', async () => {
    const before = await assignmentLeftovers(assignmentId, STUDENT_EMAIL!);
    if (before) expect(before).toMatchObject({ assignment: true, submissions: 1, tombstones: 1 });
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: ADMIN_EMAIL!, password: ADMIN_PASSWORD! });
    await dismissTourIfPresent(page);
    await page.goto('/dashboard/list/assignments');
    await dismissTourIfPresent(page);
    const row = assignmentRow(page, CLASS_A_NAME, DUE_OFFSET);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Delete assignment' }).first().click();
    await expect(page.getByText("1 student's submission, with every attempt and file, will be deleted too.", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1 grade already given stays in Results and the gradebook\./)).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  });

  await test.step('nothing is left under the assignment, and the grade is still there', async () => {
    if (!(await assignmentLeftovers(assignmentId, STUDENT_EMAIL!))) test.skip(true, 'No service account: Firestore cannot be checked directly');
    await expect.poll(async () => assignmentLeftovers(assignmentId, STUDENT_EMAIL!), { timeout: 30_000 }).toEqual({
      assignment: false,
      submissions: 0,
      attempts: 0,
      tombstones: 0,
      results: 1,
    });
    await deleteQaResults(assignmentId);
  });
});
