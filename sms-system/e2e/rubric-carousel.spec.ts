import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { dismissTourIfPresent, forceLiveData } from "./helpers";
import { adminDb, HAS_ADMIN_SDK, institutionId } from "./lesson-notes-support";
import { hideDevToggle, loginAs, swipe } from "./exams-support";

// The rubric carousel in the view dialog, against the live QA institution (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md
// section 6): a teacher on a phone-sized window moves by swipe, button and jump list, and on a desktop-sized window by the
// arrow keys. It writes one rubric with the Admin SDK and removes it at the end. A real phone is a manual check.

test.describe.configure({ mode: "serial" });

const RUBRIC_ID = "qa_rubric_carousel";
const TITLE = "QA Rubric Carousel";
const rubricRef = async () =>
  adminDb!
    .collection("institutions")
    .doc(await institutionId())
    .collection("rubrics")
    .doc(RUBRIC_ID);
const criterion = (n: number) => ({
  id: `c${n}`,
  name: `QA criterion ${n}`,
  maxPoints: 4,
  levels: [
    {
      label: "Excellent",
      points: 4,
      description: `Level text for criterion ${n}`,
    },
    { label: "Beginning", points: 1 },
  ],
});

let context: BrowserContext;
let page: Page;
const dialog = () => page.getByRole("dialog");
// Exact, because the screen-reader announcement also starts with these words.
const position = (n: number) =>
  dialog().getByText(`Criterion ${n} of 3`, { exact: true });
const openRubric = async () => {
  await page.goto("/dashboard/list/rubrics");
  await dismissTourIfPresent(page);
  await hideDevToggle(page);
  await page.getByRole("button", { name: `View ${TITLE}` }).click();
  await expect(dialog()).toBeVisible();
};

test.beforeAll(async ({ browser }) => {
  test.skip(
    !HAS_ADMIN_SDK,
    "scripts/service-account.json is required (it writes the rubric)",
  );
  test.skip(!process.env.QA_ADMIN_EMAIL, "QA_ADMIN_* missing from .env.qa");
  const iid = await institutionId();
  await (
    await rubricRef()
  ).set({
    institutionId: iid,
    title: TITLE,
    description: "Written by the rubric carousel e2e spec.",
    criteria: [criterion(1), criterion(2), criterion(3)],
    createdBy: "qa",
    createdByRole: "institution_admin",
  });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, "teacher");
});

test.afterAll(async () => {
  if (HAS_ADMIN_SDK) await (await rubricRef()).delete();
  await context?.close();
});

test("on a phone the dialog moves by swipe, button and jump list, and stops at the ends", async () => {
  await openRubric();
  await expect(position(1)).toBeVisible();
  await expect(dialog().getByText("Level text for criterion 1")).toBeVisible();
  await expect(dialog().getByText("Level text for criterion 2")).toHaveCount(0);

  await swipe(page, "left");
  await expect(position(2)).toBeVisible();
  await swipe(page, "right");
  await expect(position(1)).toBeVisible();
  await swipe(page, "right");
  await expect(position(1), "it does not wrap").toBeVisible();

  await dialog().getByRole("button", { name: "Next criterion" }).click();
  await expect(dialog().getByText("Level text for criterion 2")).toBeVisible();
  await dialog()
    .getByRole("combobox", { name: "Jump to a criterion" })
    .selectOption({ label: "3. QA criterion 3" });
  await expect(position(3)).toBeVisible();
  await expect(
    dialog().getByRole("button", { name: "Next criterion" }),
  ).toHaveAttribute("aria-disabled", "true");

  await page.keyboard.press("Escape");
  await expect(dialog()).toBeHidden();
});

test("on a desktop-sized window the arrow keys move it, and the focus stays on the button", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openRubric();
  await expect(
    dialog().getByRole("button", { name: "Next criterion" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(position(2)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(position(1)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(position(2)).toBeVisible();
  await expect(
    dialog().getByRole("button", { name: "Next criterion" }),
  ).toBeFocused();
});
