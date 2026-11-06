import { readFileSync } from "node:fs";
import {
  test,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
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

const uploadButton = (dialog: Locator) =>
  dialog.getByRole("button", { name: "Upload", exact: true });
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
  const confirmation = dialog.getByRole("checkbox", {
    name: /no student names/,
  });
  await expect(confirmation).toBeVisible();
  await expect(
    uploadButton(dialog),
    "off until the file is confirmed",
  ).toBeDisabled();
  await confirmation.check();
  await expect(uploadButton(dialog)).toBeEnabled();
  await dialog.getByLabel("Title").fill(UPLOAD_TITLE);
  await uploadButton(dialog).click();
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
  await expect(
    page.getByText(/This shows how this work will be marked/),
    "a student is told how to use the rubric",
  ).toBeVisible();
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

test("a teacher takes the rubrics tour", async () => {
  await page.getByRole("button", { name: "Take a tour" }).click();
  for (const title of ["Rubrics", "Upload a rubric", "Start from a template"]) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next →" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Review what was read", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip Tour" }).click();
  await expect(page.getByRole("button", { name: "Skip Tour" })).toBeHidden();
});

test("a teacher keeps one of two rubrics in a file, as a grid with no file, then replaces a stored file with a grid", async () => {
  await page.getByRole("button", { name: "Download Template" }).click();
  const menu = page.getByRole("dialog");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    menu.getByRole("button", { name: "Markdown (.md)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("Rubric-template.md");
  const template = readFileSync(await download.path());
  await expect(menu).toBeHidden();
  const twoRubrics = Buffer.concat([
    template,
    Buffer.from(
      "\n## Second\n\n| Criterion | Excellent (4) | Good (3) |\n| --- | --- | --- |\n| Not kept | a | b |\n",
    ),
  ]);

  await page.getByRole("button", { name: "Upload rubric" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "two.md",
    mimeType: "",
    buffer: twoRubrics,
  });
  await expect(dialog.getByText(/found 2 rubrics/)).toBeVisible();
  await dialog.getByRole("checkbox", { name: /Table 2/ }).uncheck();
  await dialog.getByRole("radio", { name: "Type a title" }).first().check();
  await dialog
    .getByRole("textbox", { name: "Title for Table 1" })
    .fill(UPLOAD_TITLE);
  const reviewGrid = dialog.getByRole("button", { name: "Review grid" });
  await expect(reviewGrid, "off until the grids are confirmed").toBeDisabled();
  await dialog.getByRole("checkbox", { name: /no student names/ }).check();
  await reviewGrid.click();

  const review = page.getByRole("dialog", { name: "Review the grid" });
  await expect(review.locator('input[value="Organisation"]')).toBeVisible();
  await review.locator('input[value="Organisation"]').fill("QA reviewed");
  await review.getByRole("button", { name: "Save rubric" }).click();
  await expect(review).toBeHidden();

  const search = page.getByRole("searchbox", { name: "Search rubrics" });
  await search.fill(UPLOAD_TITLE);
  await expect(row()).toBeVisible();
  await page.getByLabel("Type", { exact: true }).selectOption("Grid + file");
  await expect(row(), "the file was not kept").toBeHidden();
  await page.getByLabel("Type", { exact: true }).selectOption("Grid");
  await expect(row()).toBeVisible();
  await page.getByLabel("Type", { exact: true }).selectOption("");
  await search.fill("");

  await poll(uploadedRubric, (doc) => doc !== null);
  const saved = await uploadedRubric();
  const names = (doc: typeof saved) =>
    (doc!.get("criteria") as { name: string }[]).map((c) => c.name);
  expect(names(saved)).toEqual([
    "Content and ideas",
    "QA reviewed",
    "Language",
  ]);
  expect(saved!.get("file"), "no file summary").toBeUndefined();
  expect(
    (await saved!.ref.collection("file").doc("current").get()).exists,
    "no file body",
  ).toBe(false);
  await row()
    .getByRole("button", { name: /delete/i })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await poll(uploadedRubric, (doc) => doc === null);
  await expect(row(), "the teacher deleted their own upload").toBeHidden();

  // A rubric that holds only a stored file, then that file replaced by a file with a grid.
  await page.getByRole("button", { name: "Upload rubric" }).click();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "good.md",
    mimeType: "",
    buffer: Buffer.from(MARKDOWN),
  });
  await dialog.getByRole("checkbox", { name: /no student names/ }).check();
  await dialog.getByLabel("Title").fill(UPLOAD_TITLE);
  await uploadButton(dialog).click();
  await expect(dialog).toBeHidden();
  await poll(uploadedRubric, (doc) => !!doc?.get("file"));
  const stored = (await uploadedRubric())!.ref
    .collection("file")
    .doc("current");

  await row().locator('input[type="file"]').setInputFiles({
    name: "replacement.md",
    mimeType: "",
    buffer: template,
  });
  const confirm = page.getByRole("dialog", {
    name: "Replace with this file's grid?",
  });
  await confirm.getByRole("checkbox", { name: /no student names/ }).check();
  await confirm.getByRole("button", { name: "Review grid" }).click();
  await page
    .getByRole("dialog", { name: "Review the grid" })
    .getByRole("button", { name: "Save grid" })
    .click();
  await poll(uploadedRubric, (doc) => !!doc && doc.get("file") === undefined);
  expect(names(await uploadedRubric()), "the reviewed grid is saved").toEqual([
    "Content and ideas",
    "Organisation",
    "Language",
  ]);
  expect((await stored.get()).exists, "the stored file was removed").toBe(
    false,
  );
  await removeUploaded();
});
