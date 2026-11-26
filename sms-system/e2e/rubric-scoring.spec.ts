import { test, expect } from "@playwright/test";
import { forceLiveData, login, logout, dismissTourIfPresent } from "./helpers";
import { adminDb, HAS_ADMIN_SDK, institutionId } from "./lesson-notes-support";
import {
  CLASS_A_NAME,
  INSTITUTION_NAME,
  TEACHER_EMAIL,
  TEACHER_PASSWORD,
  createAssignmentAsTeacher,
  ensurePastChangePassword,
  openAssignment,
  submissionExists,
  waitForSavedSubmission,
} from "./assignments-workflow-support";

// Scoring a grade with the rubric (RUBRICS_UPLOAD_SPEC.md section 6.14), against the live QA institution and the
// deployed rules: a part-scored rubric is refused, the picks fill the score and are saved with it, a re-grade starts from
// them and clearing the feedback removes it, and the student sees the score and the awarded level in the folded Rubric
// section. It writes one rubric and one assignment with the Admin SDK's help, and removes them at the end. Uses spec
// 08's class, teacher and assignments student.

test.describe.configure({ mode: "serial" });

const RUBRIC_ID = "qa_rubric_scoring";
const RUBRIC_TITLE = "QA Scoring Rubric";
const TITLE = "QA Scoring Assignment";
const OFFSET = 11;
const TEST_PDF_PATH = "e2e/.fixtures/qa-submission.pdf";
const STUDENT_EMAIL = process.env.QA_ASSIGNMENTS_STUDENT_EMAIL;
const STUDENT_PASSWORD = process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD;

const institution = async () =>
  adminDb!.collection("institutions").doc(await institutionId());
const rubricRef = async () =>
  (await institution()).collection("rubrics").doc(RUBRIC_ID);
const assignments = async () =>
  (
    await (await institution())
      .collection("assignments")
      .where("title", "==", TITLE)
      .get()
  ).docs;
const submission = async () => {
  const a = (await assignments())[0];
  if (!a) return undefined;
  const subs = await a.ref.collection("submissions").get();
  return subs.docs[0]?.data();
};

async function removeFixtures(): Promise<void> {
  const inst = await institution();
  for (const a of await assignments()) {
    const results = await inst
      .collection("results")
      .where("assignmentId", "==", a.id)
      .get();
    await Promise.all(results.docs.map((r) => r.ref.delete()));
    await adminDb!.recursiveDelete(a.ref);
  }
  await (await rubricRef()).delete();
}

const field = (label: string) =>
  `xpath=//label[normalize-space(text())="${label}"]/following-sibling::*[self::input or self::textarea][1]`;

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, "scripts/service-account.json is required");
  await removeFixtures();
  await (
    await rubricRef()
  ).set({
    institutionId: await institutionId(),
    title: RUBRIC_TITLE,
    criteria: [
      {
        id: "c1",
        name: "Content",
        maxPoints: 4,
        levels: [
          { label: "Excellent", points: 4, description: "" },
          { label: "Fair", points: 2, description: "Some relevant points" },
        ],
      },
      { id: "c2", name: "Sources", maxPoints: 6, levels: [] },
    ],
    createdBy: "qa",
    createdByRole: "institution_admin",
  });
});

test.afterAll(async () => {
  if (HAS_ADMIN_SDK) await removeFixtures();
});

test("a teacher scores each criterion; the student sees the score and the awarded level", async ({
  page,
  context,
}) => {
  test.skip(
    !INSTITUTION_NAME || !TEACHER_EMAIL || !STUDENT_EMAIL,
    "QA_* credentials missing from .env.qa",
  );
  test.setTimeout(300_000);
  await forceLiveData(context);
  const teacher = {
    institutionLabel: INSTITUTION_NAME!,
    email: TEACHER_EMAIL!,
    password: TEACHER_PASSWORD!,
  };
  const openGrade = async () => {
    await openAssignment(page, CLASS_A_NAME, OFFSET);
    const gradeButton = page.getByRole("button", {
      name: /^(Grade|Re-grade)$/,
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await gradeButton.isVisible({ timeout: 8_000 }).catch(() => false))
        break;
      await page.reload();
      await dismissTourIfPresent(page);
    }
    await gradeButton.click();
  };

  await test.step("the teacher creates an assignment that uses the rubric", async () => {
    await login(page, teacher);
    await dismissTourIfPresent(page);
    await createAssignmentAsTeacher(page, {
      title: TITLE,
      className: CLASS_A_NAME,
      dueDateOffsetDays: OFFSET,
      type: "Homework",
      status: "Published",
      gradingMode: "standalone",
      rubricTitle: RUBRIC_TITLE,
    });
    await logout(page);
  });

  await test.step("the student submits", async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: STUDENT_EMAIL!,
      password: STUDENT_PASSWORD!,
    });
    await ensurePastChangePassword(page, STUDENT_PASSWORD!);
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, OFFSET);
    if (!(await submissionExists(page, STUDENT_EMAIL!))) {
      await page.locator('input[type="file"]').setInputFiles(TEST_PDF_PATH);
      await expect(page.getByText("Submitted", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await waitForSavedSubmission(page, STUDENT_EMAIL!);
    }
    await logout(page);
  });

  await test.step("the teacher's picks fill the score, a part-scored rubric is refused, and the scores are saved", async () => {
    await login(page, teacher);
    await dismissTourIfPresent(page);
    await openGrade();
    // The level's description shows in its button, for a touch screen.
    await expect(
      page
        .getByRole("button", { name: /^Fair/ })
        .getByText("Some relevant points"),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Fair/ }).click();
    await expect(page.locator(field("Score"))).toHaveValue("2");
    await expect(page.locator(field("Max Score"))).toHaveValue("10");
    await page.getByRole("button", { name: "Save Grade", exact: true }).click();
    await expect(
      page.getByText(
        "Score every rubric criterion, or clear the rubric scores. Still to score: Sources.",
      ),
    ).toBeVisible();
    await page.getByLabel("Points").fill("5");
    await expect(page.locator(field("Score"))).toHaveValue("7");
    await expect(page.getByText("Rubric total: 7 / 10")).toBeVisible();
    // The new pick clears the error about the criterion that was still to score.
    await expect(page.getByText(/Still to score/)).toHaveCount(0);
    await page.locator(field("Feedback (optional)")).fill("Good sources");
    await page.getByRole("button", { name: "Save Grade", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Grade —/ })).toHaveCount(
      0,
      { timeout: 10_000 },
    );
    await expect
      .poll(async () => (await submission())?.rubricTotal, { timeout: 30_000 })
      .toBe(7);
    const saved = await submission();
    expect(saved?.grade).toBe(7);
    expect(saved?.maxGrade).toBe(10);
    expect(saved?.rubricMax).toBe(10);
    expect(saved?.feedback).toBe("Good sources");
    expect(saved?.rubricScores).toEqual([
      { criterionId: "c1", points: 2, level: "Fair" },
      { criterionId: "c2", points: 5 },
    ]);
  });

  await test.step("a re-grade starts from the saved picks, and clearing the feedback removes it", async () => {
    await openGrade();
    await expect(page.getByRole("button", { name: /^Fair/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByLabel("Points")).toHaveValue("5");
    await page.locator(field("Feedback (optional)")).fill("");
    await page.getByRole("button", { name: "Save Grade", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Grade —/ })).toHaveCount(
      0,
      { timeout: 10_000 },
    );
    await expect
      .poll(async () => (await submission())?.feedback ?? "removed", {
        timeout: 30_000,
      })
      .toBe("removed");
    expect((await submission())?.rubricTotal).toBe(7);
    await logout(page);
  });

  await test.step("the student sees the score and the awarded level in the Rubric section", async () => {
    await login(page, {
      institutionLabel: INSTITUTION_NAME!,
      email: STUDENT_EMAIL!,
      password: STUDENT_PASSWORD!,
    });
    await dismissTourIfPresent(page);
    await openAssignment(page, CLASS_A_NAME, OFFSET);
    const header = page.getByRole("button", { name: /^Rubric/ });
    if ((await header.getAttribute("aria-expanded")) !== "true")
      await header.click();
    await expect(page.getByText("Your rubric score: 7 / 10")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Awarded", { exact: true })).toBeVisible();
    await logout(page);
  });
});
