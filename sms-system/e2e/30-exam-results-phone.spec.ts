import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK, userByEmail } from './lesson-notes-support';
import { EXAM_PREFIX, QUESTIONS_CSV, answerQuestions, createOnlineExam, examByTitle, hideDevToggle, importQuestions, loginAs, subDoc, sweepQaExams } from './exams-support';

// The staff results page on a phone-sized screen (360 px), against the live QA institution: nothing makes the page scroll
// sideways, a student's card has buttons of 44 px, the toolbar keeps Grade now in view and puts the rest behind a More menu,
// the question difficulty is a list of cards, the timeline of a student leaving the page is a list that fits its dialog, and a
// dialog's close target is 44 px; a computer-sized window gets the toolbar and the table as before. A real phone is a manual check.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} results phone ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
const state = { examId: '', studentUid: '' };
const studentEmail = process.env.QA_ASSIGNMENTS_STUDENT_EMAIL;

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required (ground-truth reads)');
  test.skip(!studentEmail || !process.env.QA_ADMIN_EMAIL, 'QA_ASSIGNMENTS_STUDENT_* / QA_ADMIN_* missing from .env.qa');
  state.studentUid = (await userByEmail(studentEmail!)).uid;
  await sweepQaExams();
  context = await browser.newContext();
  await forceLiveData(context);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  if (HAS_ADMIN_SDK) await sweepQaExams();
});

const poll = <T>(read: () => Promise<T>, check: (v: T) => boolean, timeout = 30_000) =>
  expect.poll(async () => check(await read()), { timeout, intervals: [500, 1000, 2000] }).toBe(true);

/** Nothing makes the page, or the dashboard's scrolling area, wider than the screen. */
async function expectNoSidewaysScroll(label: string) {
  const sizes = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    return { page: document.documentElement.scrollWidth, window: window.innerWidth, main: main.scrollWidth, mainBox: main.clientWidth };
  });
  expect(sizes.page, `${label}: the page does not scroll sideways`).toBeLessThanOrEqual(sizes.window + 1);
  expect(sizes.main, `${label}: the scrolling area does not scroll sideways`).toBeLessThanOrEqual(sizes.mainBox + 1);
}

async function expectBigEnough(locator: ReturnType<Page['locator']>, label: string) {
  const b = await locator.boundingBox();
  expect(b, `${label} is on the page`).not.toBeNull();
  expect(Math.min(b!.width, b!.height), `${label} is big enough for a finger`).toBeGreaterThanOrEqual(43);
}

const card = () => page.locator('li', { hasText: 'Submitted' }).first();

test('the teacher builds and publishes an exam', async () => {
  await loginAs(page, 'teacher');
  await createOnlineExam(page, TITLE);
  await poll(() => examByTitle(TITLE), (e) => e !== null);
  state.examId = (await examByTitle(TITLE))!.id;
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await importQuestions(page, QUESTIONS_CSV);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await poll(() => subDoc(state.examId, 'content', 'questions'), (q) => Array.isArray(q?.items) && (q!.items as unknown[]).length === 3);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Confirm' }).getByRole('button', { name: /^Yes, publish$/ }).click();
  await poll(async () => (await examByTitle(TITLE))?.data.status, (s) => s === 'published');
});

test('a student sits the exam, copies something and submits', async ({ browser }) => {
  await context.close();
  context = await browser.newContext();
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, 'studentA');
  await page.goto('/dashboard/list/exams');
  await page.getByRole('link', { name: `Start ${TITLE}` }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 30_000 });
  await answerQuestions(page);
  // A copy is an act the log records, which gives the results page a timeline to open.
  await page.evaluate(() => window.dispatchEvent(new Event('copy')));
  await page.getByRole('button', { name: 'Submit exam' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit exam' }).click();
  await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a?.status === 'submitted');
});

test('on a phone the results are cards, the toolbar keeps Grade now in view and puts the rest in a More menu', async ({ browser }) => {
  await context.close();
  context = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, 'teacher');
  await page.goto(`/dashboard/list/exams/${state.examId}/results`);
  await expect(card()).toBeVisible({ timeout: 60_000 });
  await hideDevToggle(page);

  await expect(page.locator('table'), 'cards, not the table').toHaveCount(0);
  await expectNoSidewaysScroll('the results');

  await test.step('the student’s buttons are at least 44 px', async () => {
    const buttons = card().getByRole('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i += 1) await expectBigEnough(buttons.nth(i), `button ${i + 1} of the card`);
  });

  await test.step('Grade now stays in view and the rest are behind More', async () => {
    await expectBigEnough(page.getByRole('button', { name: 'Grade now' }), 'Grade now');
    await expect(page.getByRole('button', { name: 'Export CSV' }), 'Export is in the menu on a phone').toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
    await page.getByRole('button', { name: 'More' }).click();
    for (const name of ['Export CSV', 'Show question difficulty', 'Refresh', 'Finalize exam']) {
      await expect(page.getByRole('menuitem', { name }), name).toBeVisible();
    }
    await expect(page.getByRole('menuitem', { name: 'Finalize exam' }), 'the exam is still open').toHaveAttribute('aria-disabled', 'true');
    await expectBigEnough(page.getByRole('menuitem', { name: 'Export CSV' }), 'a menu item');
    await expectNoSidewaysScroll('the open menu');
  });

  await test.step('the question difficulty is a list of cards that fits', async () => {
    await page.getByRole('menuitem', { name: 'Show question difficulty' }).click();
    const section = page.getByRole('region', { name: 'Question difficulty' });
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section.locator('li')).toHaveCount(3);
    await expect(section.locator('table')).toBeHidden();
    await expectNoSidewaysScroll('the difficulty');
    await expect(page.getByRole('button', { name: 'More' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('menuitem', { name: 'Show question difficulty' }), 'it is not offered again once shown').toHaveCount(0);
    await page.keyboard.press('Escape');
  });
});

test('the timeline is a list that fits its dialog, and the close target is 44 px', async () => {
  await card().getByRole('button', { name: /left the exam page/ }).click();
  const dialog = page.getByRole('dialog', { name: /left the exam page/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Timeline' })).toBeVisible();
  await expect(dialog.locator('table')).toBeHidden();
  const fits = await dialog.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(fits.scroll, 'the dialog does not scroll sideways').toBeLessThanOrEqual(fits.client + 1);
  await expectBigEnough(dialog.getByRole('button', { name: 'Close', exact: true }).first(), 'the close button');
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(dialog).toBeHidden();

  await test.step('the score dialog fits the screen', async () => {
    await card().getByRole('button', { name: /Enter a score for/ }).click();
    const score = page.getByRole('dialog', { name: /Enter a score for/ });
    await expect(score).toBeVisible();
    const box = (await score.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await score.getByRole('button', { name: 'Cancel' }).click();
    await expect(score).toBeHidden();
  });
});

test('a computer-sized window gets the toolbar and the table as before', async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('table').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'More' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalize exam' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Integrity' })).toBeVisible();
});
