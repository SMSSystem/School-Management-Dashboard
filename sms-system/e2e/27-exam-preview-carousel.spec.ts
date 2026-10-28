import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK } from './lesson-notes-support';
import { box, createOnlineExam, EXAM_PREFIX, examByTitle, hideDevToggle, importQuestions, loginAs, poll, QUESTIONS_CSV, removeTall, subCount, subDoc, sweepQaExams, swipe } from './exams-support';

// Preview as student in the carousel layout, against the live QA institution: a teacher on a phone-sized window gets the
// student's screen without a clock and without Submit (the bars stick, the Questions button opens the list with the staff-only
// tools, a swipe moves between questions), a tablet held upright gets it beside the sidebar, and a desktop-sized window gets
// the preview it always had. Nothing is saved by previewing. A real phone is a manual check.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} preview ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
const state = { examId: '' };

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required (ground-truth reads)');
  test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_* missing from .env.qa');
  await sweepQaExams();
  context = await browser.newContext();
  await forceLiveData(context);
  page = await context.newPage();
});

test.afterAll(async () => {
  await context?.close();
  if (HAS_ADMIN_SDK) await sweepQaExams();
});

const where = (n: number, answered = 0) => page.getByText(`Question ${n} of 3 · ${answered} answered`);
const questionsButton = () => page.getByRole('button', { name: /^Questions,/ });
const sheet = () => page.getByRole('dialog', { name: 'Questions' });

/** Makes the question area very tall, so the page has to scroll. */
const makeTall = (p: Page) =>
  p.evaluate(() => {
    const area = document.querySelector('[data-exam-preview] [aria-roledescription="carousel"]');
    const spacer = document.createElement('div');
    spacer.id = 'e2e-spacer';
    spacer.style.height = '2500px';
    area?.appendChild(spacer);
  });

/** The top bar is at the top of the scrolling area and the buttons at the bottom of it, wherever the page is scrolled. */
async function expectBarsInView(p: Page) {
  for (const where of ['top', 'bottom'] as const) {
    await p.evaluate((w) => {
      const main = document.querySelector('main')!;
      main.scrollTop = w === 'top' ? 0 : main.scrollHeight;
    }, where);
    const main = await box(p.locator('main'));
    const header = await box(p.locator('[data-exam-preview] header'));
    const bar = await box(questionsButton());
    expect(header.y, `the top bar stays at the top (scrolled to the ${where})`).toBeGreaterThanOrEqual(main.y - 1);
    expect(header.y, `the top bar stays at the top (scrolled to the ${where})`).toBeLessThanOrEqual(main.y + 2);
    expect(bar.y + bar.height, `the buttons stay at the bottom (scrolled to the ${where})`).toBeLessThanOrEqual(main.y + main.height + 1);
    expect(bar.y, `the buttons stay at the bottom (scrolled to the ${where})`).toBeGreaterThanOrEqual(main.y + main.height - 90);
  }
}

test('the teacher builds an exam with three saved questions', async () => {
  await loginAs(page, 'teacher');
  await createOnlineExam(page, TITLE);
  await poll(() => examByTitle(TITLE), (e) => e !== null);
  state.examId = (await examByTitle(TITLE))!.id;
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await importQuestions(page, QUESTIONS_CSV);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await poll(() => subDoc(state.examId, 'content', 'questions'), (q) => Array.isArray(q?.items) && (q!.items as unknown[]).length === 3);
});

test('on a phone the preview has the student’s bars without a clock or Submit, and its own tools in the list', async ({ browser }) => {
  await context.close();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, 'teacher');
  await page.goto(`/dashboard/list/exams/${state.examId}/preview`);
  await expect(where(1)).toBeVisible({ timeout: 30_000 });
  await hideDevToggle(page);

  await expect(page.locator('[data-exam-preview]')).toBeVisible();
  await expect(page.getByRole('timer'), 'a preview has no clock').toHaveCount(0);
  await expect(page.locator('[data-exam-preview] header').getByText('Preview', { exact: true })).toBeVisible();
  await expect(page.getByText('Preview — nothing is saved.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit exam' }), 'a preview has no Submit').toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Questions' }), 'the numbered buttons are in the sheet').toHaveCount(0);

  await makeTall(page);
  await expectBarsInView(page);
  await removeTall(page);
  await page.evaluate(() => {
    document.querySelector('main')!.scrollTop = 0;
  });

  await test.step('the Questions button opens the list with the staff-only tools and no Submit', async () => {
    await questionsButton().click();
    await expect(sheet()).toBeVisible();
    await expect(sheet().getByText('0 of 3 answered')).toBeVisible();
    await expect(sheet().getByText('Preview tools')).toBeVisible();
    await expect(sheet().getByRole('button', { name: 'Clear my answers' })).toBeVisible();
    await expect(sheet().getByRole('button', { name: 'Submit exam' })).toHaveCount(0);
    await sheet().getByRole('button', { name: /^Question 3,/ }).click();
    await expect(sheet()).toBeHidden();
    await expect(where(3)).toBeVisible();
  });

  await test.step('on the last question Next is off and there is no Submit', async () => {
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Submit exam' })).toHaveCount(0);
  });

  await test.step('a swipe moves between the questions, freely', async () => {
    await swipe(page, 'right');
    await expect(where(2)).toBeVisible();
    await swipe(page, 'right');
    await expect(where(1)).toBeVisible();
    await swipe(page, 'left');
    await expect(where(2)).toBeVisible();
    await swipe(page, 'right');
    await expect(where(1)).toBeVisible();
  });

  await test.step('answering is kept in the page, and Clear my answers from the list empties it', async () => {
    await page.getByRole('radio', { name: 'Mercury', exact: true }).check();
    await expect(where(1, 1)).toBeVisible();
    await questionsButton().click();
    await sheet().getByRole('button', { name: 'Clear my answers' }).click();
    await expect(sheet()).toBeHidden();
    await expect(where(1, 0)).toBeVisible();
  });

  await test.step('previewing wrote nothing', async () => {
    expect(await subCount(state.examId, 'attempts')).toBe(0);
  });
});

test('a tablet held upright gets it beside the sidebar', async () => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('[data-exam-preview]')).toBeVisible();
  const sidebar = await box(page.locator('aside#tour-sidebar'));
  const main = await box(page.locator('main'));
  expect(sidebar.x + sidebar.width, 'the sidebar is beside the page, not under it').toBeLessThanOrEqual(main.x + 1);
  await makeTall(page);
  await expectBarsInView(page);
  const bar = await box(questionsButton());
  expect(bar.x, 'the buttons are inside the page, not under the sidebar').toBeGreaterThanOrEqual(main.x);
  await removeTall(page);
});

test('a desktop-sized window gets the preview it always had', async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('[data-exam-preview]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(page.getByText('Answered 0 of 3')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Questions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear my answers' })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(0);
});
