import { test, expect } from "@playwright/test";
import { forceLiveData, login, logout, dismissTourIfPresent } from "./helpers";
import { adminDb, HAS_ADMIN_SDK, institutionId } from "./lesson-notes-support";
import {
  CLASS_A_NAME,
  INSTITUTION_NAME,
  TEACHER_EMAIL,
  TEACHER_PASSWORD,
  assignmentRow,
  createAssignmentAsTeacher,
  ensurePastChangePassword,
  openAssignment,
  submissionExists,
  waitForSavedSubmission,
} from "./assignments-workflow-support";

// Freezing an assignment's rubric at the first grade (RUBRICS_UPLOAD_SPEC.md section 6.13), against the live QA
// institution and the deployed rules: grading freezes the grid; editing the shared rubric, then deleting it, doesn't
// change the graded assignment; and editing an ungraded assignment whose rubric was deleted keeps the link. It writes one
// rubric and two assignments with the Admin SDK's help, and removes them at the end. Uses spec 08's class, teacher and
// assignments student.

test.describe.configure({ mode: "serial" });

const RUBRIC_ID = "qa_rubric_freeze";
const RUBRIC_TITLE = "QA Freeze Rubric";
const GRADED = "QA Freeze Graded Assignment";
const UNGRADED = "QA Freeze Ungraded Assignment";
const GRADED_OFFSET = 8;
const UNGRADED_OFFSET = 9;
const TEST_PDF_PATH = "e2e/.fixtures/qa-submission.pdf";
const STUDENT_EMAIL = process.env.QA_ASSIGNMENTS_STUDENT_EMAIL;
const STUDENT_PASSWORD = process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD;

const institution = async () => adminDb!.collection("institutions").doc(await institutionId());
const rubricRef = async () => (await institution()).collection("rubrics").doc(RUBRIC_ID);
const assignmentsTitled = async (title: string) =>
  (await (await institution()).collection("assignments").where("title", "==", title).get()).docs;
const grid = (name: string) => [
  { id: "c1", name, maxPoints: 4, levels: [{ label: "Good", points: 4, description: "" }] },
];

async function removeFixtures(): Promise<void> {
  const inst = await institution();
  for (const title of [GRADED, UNGRADED]) {
    for (const a of await assignmentsTitled(title)) {
      const results = await inst.collection("results").where("assignmentId", "==", a.id).get();
      await Promise.all(results.docs.map((r) => r.ref.delete()));
      await adminDb!.recursiveDelete(a.ref);
    }
  }
  await (await rubricRef()).delete();
}

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, "scripts/service-account.json is required");
  await removeFixtures();
  await (await rubricRef()).set({
    institutionId: await institutionId(),
    title: RUBRIC_TITLE,
    criteria: grid("Original criterion"),
    createdBy: "qa",
    createdByRole: "institution_admin",
  });
});

test.afterAll(async () => {
  if (HAS_ADMIN_SDK) await removeFixtures();
});

test("grading freezes the grid, which later edits and the rubric's deletion don't change; an ungraded assignment keeps its link", async ({
  page,
  context,
}) => {
  test.skip(!INSTITUTION_NAME || !TEACHER_EMAIL || !STUDENT_EMAIL, "QA_* credentials missing from .env.qa");
  test.setTimeout(300_000);
  await forceLiveData(context);

  await test.step("the teacher creates two assignments that use the rubric", async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    for (const [title, offset] of [
      [GRADED, GRADED_OFFSET],
      [UNGRADED, UNGRADED_OFFSET],
    ] as const) {
      await createAssignmentAsTeacher(page, {
        title,
        className: CLASS_A_NAME,
        dueDateOffsetDays: offset,
        type: "Homework",
        status: "Published",
        gradingMode: "standalone",
        rubricTitle: RUBRIC_TITLE,
      });
    }
    await logout(page);
  });

  await test.step("the student submits the first", async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: STUDENT_EMAIL!, password: STUDENT_PASSWORD! });
    await ensurePastChangePassword(page, STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GRADED_OFFSET);
    if (!(await submissionExists(page, STUDENT_EMAIL!))) {
      await page.locator('input[type="file"]').setInputFiles(TEST_PDF_PATH);
      await expect(page.getByText("Submitted", { exact: true })).toBeVisible({ timeout: 15_000 });
      await waitForSavedSubmission(page, STUDENT_EMAIL!);
    }
    await logout(page);
  });

  await test.step("the teacher grades it, which freezes the rubric's grid on the assignment", async () => {
    await login(page, { institutionLabel: INSTITUTION_NAME!, email: TEACHER_EMAIL!, password: TEACHER_PASSWORD! });
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, GRADED_OFFSET);
    const gradeButton = page.getByRole("button", { name: /^(Grade|Re-grade)$/ });
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await gradeButton.isVisible({ timeout: 8_000 }).catch(() => false)) break;
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await gradeButton.click();
    await page.locator('xpath=//label[normalize-space(text())="Score"]/following-sibling::input[1]').fill("3");
    await page.locator('xpath=//label[normalize-space(text())="Max Score"]/following-sibling::input[1]').fill("4");
    await page.getByRole("button", { name: "Save Grade", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Grade —/ })).toHaveCount(0, { timeout: 10_000 });
    await expect
      .poll(async () => (await assignmentsTitled(GRADED))[0]?.data().rubricFrozen?.criteria?.[0]?.name, { timeout: 30_000 })
      .toBe("Original criterion");
  });

  await test.step("editing the shared rubric doesn't change the graded assignment", async () => {
    await (await rubricRef()).update({ criteria: grid("Changed criterion") });
    await page.reload();
    await dismissTourIfPresent(page);
    await expect(page.getByText("This is the rubric as it was when grading started", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Original criterion").first()).toBeVisible();
    await expect(page.getByText("Changed criterion")).toHaveCount(0);
  });

  await test.step("deleting the rubric doesn't change it either", async () => {
    await (await rubricRef()).delete();
    await page.reload();
    await dismissTourIfPresent(page);
    await expect(page.getByText("Original criterion").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Rubric not found/)).toHaveCount(0);
  });

  await test.step("editing the ungraded assignment keeps its link to the deleted rubric", async () => {
    await page.goto("/dashboard/list/assignments");
    await dismissTourIfPresent(page);
    const row = assignmentRow(page, CLASS_A_NAME, UNGRADED_OFFSET);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /^Edit / }).first().click();
    const picker = page.locator('select[name="rubricId"]');
    await expect(picker.locator("option:checked")).toHaveText("Deleted rubric (no longer available)", { timeout: 15_000 });
    // Focusing and leaving the picker used to clear a rubric it had no option for.
    await picker.focus();
    await page.locator('input[name="title"]').focus();
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.locator('input[name="title"]')).toHaveCount(0, { timeout: 15_000 });
    expect((await assignmentsTitled(UNGRADED))[0]?.data().rubricId).toBe(RUBRIC_ID);
  });
});
