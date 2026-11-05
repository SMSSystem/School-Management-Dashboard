import { readFileSync } from "node:fs";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { dismissTourIfPresent, forceLiveData } from "./helpers";
import {
  adminDb,
  HAS_ADMIN_SDK,
  institutionId,
  userByEmail,
} from "./lesson-notes-support";
import { FIXTURES, loginAs } from "./lesson-notes-ui-support";
import { hideDevToggle, poll } from "./exams-support";

// Rubric files against the live QA institution (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md). It needs the rules and the
// index exemption deployed. A teacher uploads, downloads and deletes a rubric through the app, and a student downloads one and
// moves through its carousel on an assignment's page. It writes one rubric and one assignment with the Admin SDK and removes
// everything it wrote, so a failed run is cleaned up by the next one.

test.describe.configure({ mode: "serial" });

const UPLOAD_TITLE = "QA Rubric Upload";
const GRID_ID = "qa_rubric_files_grid";
const GRID_TITLE = "QA Rubric Files Grid";
const ASSIGNMENT_ID = "qa_rubric_files_assignment";
const MARKDOWN =
  "# QA rubric\n\n| Criterion | Good (4) |\n| --- | --- |\n| Content | Clear |\n";

const inst = async () =>
  adminDb!.collection("institutions").doc(await institutionId());
const gridRubric = async () =>
  (await inst()).collection("rubrics").doc(GRID_ID);
const assignment = async () =>
  (await inst()).collection("assignments").doc(ASSIGNMENT_ID);

async function uploadedRubric() {
  const snap = await (await inst())
    .collection("rubrics")
    .where("title", "==", UPLOAD_TITLE)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

async function removeUploaded() {
  const found = await uploadedRubric();
  if (!found) return;
  await found.ref.collection("file").doc("current").delete();
  await found.ref.delete();
}

const criterion = (n: number) => ({
  id: `c${n}`,
  name: `QA criterion ${n}`,
  maxPoints: 4,
  levels: [{ label: "Good", points: 4, description: `Level text ${n}` }],
});

let context: BrowserContext;
let page: Page;

const row = () => page.getByRole("row", { name: new RegExp(UPLOAD_TITLE) });
const openRubrics = async () => {
  await page.goto("/dashboard/list/rubrics");
  await dismissTourIfPresent(page);
  await hideDevToggle(page);
};

test.beforeAll(async ({ browser }) => {
  test.skip(
    !HAS_ADMIN_SDK,
    "scripts/service-account.json is required (ground-truth reads)",
  );
  test.skip(!process.env.QA_ADMIN_EMAIL, "QA_ADMIN_* missing from .env.qa");
  await removeUploaded();
  context = await browser.newContext();
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, "teacher");
});

test.afterAll(async () => {
  if (HAS_ADMIN_SDK) {
    await removeUploaded();
    await (await gridRubric()).delete();
    await (await assignment()).delete();
  }
  await context?.close();
});

test("a teacher is refused a bad file, then uploads a good one", async () => {
  await openRubrics();
  await page.getByRole("button", { name: "Upload rubric" }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.locator('input[type="file"]');

  await input.setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\nc,=1+1"),
  });
  await expect(dialog.getByText(/Row 2 has a cell/)).toBeVisible();

  await input.setInputFiles({
    name: "good.md",
    mimeType: "",
    buffer: Buffer.from(MARKDOWN),
  });
  await expect(
    dialog.getByRole("button", { name: "Upload", exact: true }),
  ).toBeEnabled();
  await dialog.getByLabel("Title").fill(UPLOAD_TITLE);
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(row()).toBeVisible();
  await poll(uploadedRubric, (doc) => doc !== null);
  const saved = await uploadedRubric();
  expect(saved!.get("criteria")).toEqual([]);
  expect(saved!.get("file.mimeType")).toBe("text/markdown");
  expect(
    saved!.get("dataUrl"),
    "the body is not on the rubric",
  ).toBeUndefined();
  const body = await saved!.ref.collection("file").doc("current").get();
  expect(
    Buffer.from(String(body.get("dataUrl")).split(",")[1], "base64").toString(),
  ).toBe(MARKDOWN);
});

test("the teacher downloads the original, byte for byte", async () => {
  await row()
    .getByRole("button", { name: `Download ${UPLOAD_TITLE}` })
    .click();
  const dialog = page.getByRole("dialog");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: /Original file/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("good.md");
  expect(readFileSync(await download.path()).toString()).toBe(MARKDOWN);
});

test("a student moves through a rubric on an assignment and downloads it", async () => {
  const student = await userByEmail(FIXTURES.studentB.email);
  const classId = student?.classId as string;
  expect(classId, "the fixture student has a class").toBeTruthy();
  await (
    await gridRubric()
  ).set({
    institutionId: await institutionId(),
    title: GRID_TITLE,
    criteria: [criterion(1), criterion(2)],
    createdBy: "qa",
    createdByRole: "institution_admin",
  });
  await (
    await assignment()
  ).set({
    institutionId: await institutionId(),
    title: "QA Rubric Files Assignment",
    status: "published",
    classId,
    className: "QA",
    subjectName: "QA",
    teacherName: "QA",
    teacherId: "qa",
    dueDate: "2030-01-01",
    rubricId: GRID_ID,
  });

  await context.close();
  context = await page.context().browser()!.newContext();
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, "studentB");
  await page.goto(`/dashboard/list/assignments/${ASSIGNMENT_ID}`);
  await dismissTourIfPresent(page);
  await hideDevToggle(page);

  const carousel = page.getByRole("group", { name: `${GRID_TITLE} criteria` });
  await expect(
    carousel.getByText("Criterion 1 of 2", { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await carousel.getByRole("button", { name: "Next criterion" }).click();
  await expect(carousel.getByText("Level text 2")).toBeVisible();

  await page.getByRole("button", { name: "Download rubric" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: /Original file/ }),
    "this rubric has no file",
  ).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Markdown (.md)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("QA-Rubric-Files-Grid.md");
  expect(readFileSync(await download.path()).toString()).toContain(
    "QA criterion 2",
  );
});

test("the teacher deletes their upload, and its file goes with it", async () => {
  await context.close();
  context = await page.context().browser()!.newContext();
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, "teacher");
  await openRubrics();
  const saved = await uploadedRubric();
  const fileRef = saved!.ref.collection("file").doc("current");

  await row()
    .getByRole("button", { name: /delete/i })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await poll(uploadedRubric, (doc) => doc === null);
  expect((await fileRef.get()).exists, "the file is gone too").toBe(false);
});
