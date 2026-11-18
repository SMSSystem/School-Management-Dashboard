import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK, userByEmail } from './lesson-notes-support';
import { answerQuestions, box, createOnlineExam, EXAM_PREFIX, examByTitle, hideDevToggle, importQuestions, loginAs, poll, QUESTIONS_CSV, removeTall, subDoc, sweepQaExams } from './exams-support';

// The sticky bars and the Questions sheet of the attempt screen in the carousel layout, against the live QA institution: on a
// phone and on a tablet held upright the clock sticks to the top of the dashboard's scrolling area and Previous, Questions
// and Next (Submit on the last question) stick to the bottom, however far the question is scrolled; the Questions button
// opens the numbered list as a sheet; beside the tablet's sidebar the bars stay inside the page; on a
// desktop-sized window the screen is the one it always was. One student sits one exam and the window is resized under it,
// which also shows that the answers and the question survive a change of layout.
//
// Playwright cannot scroll the page with a finger or show a phone's address bar and home indicator; those are manual checks.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} sticky bars ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
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


/** Makes the question area very tall, so the page has to scroll. */
async function makeTall(p: Page) {
  await p.evaluate(() => {
    const area = document.querySelector('[data-exam-attempt] > div:first-of-type');
    const spacer = document.createElement('div');
    spacer.id = 'e2e-spacer';
    spacer.style.height = '2500px';
    area?.appendChild(spacer);
  });
}
const scrollMain = (p: Page, to: 'top' | 'bottom') =>
  p.evaluate((where) => {
    const main = document.querySelector('main')!;
    main.scrollTop = where === 'top' ? 0 : main.scrollHeight;
  }, to);

/** The clock is at the top of the scrolling area and the buttons are at the bottom of it, wherever the page is scrolled. */
async function expectBarsInView(p: Page) {
  for (const where of ['top', 'bottom'] as const) {
    await scrollMain(p, where);
    const main = await box(p.locator('main'));
    const timer = await box(p.getByRole('timer'));
    const submit = await box(p.getByRole('button', { name: /^Questions,/ }));
    expect(timer.y, `the clock stays at the top (scrolled to the ${where})`).toBeGreaterThanOrEqual(main.y - 1);
    expect(timer.y + timer.height, `the clock stays at the top (scrolled to the ${where})`).toBeLessThanOrEqual(main.y + 90);
    expect(submit.y + submit.height, `the buttons stay at the bottom (scrolled to the ${where})`).toBeLessThanOrEqual(main.y + main.height + 1);
    expect(submit.y, `the buttons stay at the bottom (scrolled to the ${where})`).toBeGreaterThanOrEqual(main.y + main.height - 90);
  }
}

test('the teacher builds an online exam and publishes it', async () => {
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

test('on a phone the clock and the buttons stay in view while the question is scrolled', async ({ browser }) => {
  await context.close();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, 'studentA');
  await page.goto('/dashboard/list/exams');
  await page.getByRole('link', { name: `Start ${TITLE}` }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page.getByRole('timer')).toBeVisible({ timeout: 30_000 });
  await hideDevToggle(page);

  await expect(page.locator('[data-exam-attempt]')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(1);
  await expect(page.getByText('Question 1 of 3 · 0 answered')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Questions, 3 not answered' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit exam' }), 'Submit takes the place of Next on the last question').toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Questions' }), 'the numbered buttons are in the sheet, not the page').toHaveCount(0);

  await makeTall(page);
  await expectBarsInView(page);
  await removeTall(page);
  await scrollMain(page, 'top');
});

test('the Questions button opens the numbered list as a sheet, which jumps to a question and holds Submit', async () => {
  const sheet = page.getByRole('dialog', { name: 'Questions' });
  await page.getByRole('button', { name: 'Questions, 3 not answered' }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('0 of 3 answered')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Question 1, not answered' })).toHaveAttribute('aria-current', 'true');
  await expect(sheet.getByRole('button', { name: 'Submit exam' })).toBeDisabled();
  await expect(sheet.getByText('Answer all questions to submit (3 left)')).toBeVisible();
  await sheet.getByRole('button', { name: 'Question 3, not answered' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText('Question 3 of 3 · 0 answered')).toBeVisible();

  await test.step('on the last question Submit is where Next was, off, with how many are left', async () => {
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit exam' })).toBeDisabled();
    await expect(page.getByText('Answer all questions to submit (3 left)')).toBeVisible();
  });

  await test.step('Escape closes the sheet and the focus goes back to its button', async () => {
    await page.getByRole('button', { name: 'Questions, 3 not answered' }).click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Questions, 3 not answered' })).toBeFocused();
  });

  await page.getByRole('button', { name: 'Questions, 3 not answered' }).click();
  await sheet.getByRole('button', { name: 'Question 1, not answered' }).click();
  await expect(page.getByText('Question 1 of 3 · 0 answered')).toBeVisible();
});

test('the same attempt, turned into a tablet held upright, keeps its bars inside the page beside the sidebar', async () => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator('[data-exam-attempt]')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveCount(1);
  const sidebar = await box(page.locator('aside#tour-sidebar'));
  const main = await box(page.locator('main'));
  expect(sidebar.x + sidebar.width, 'the sidebar is beside the page, not under it').toBeLessThanOrEqual(main.x + 1);

  await makeTall(page);
  await expectBarsInView(page);
  const submit = await box(page.getByRole('button', { name: /^Questions,/ }));
  const timer = await box(page.getByRole('timer'));
  expect(submit.x, 'the buttons are inside the page, not under the sidebar').toBeGreaterThanOrEqual(main.x);
  expect(timer.x, 'the clock is inside the page, not under the sidebar').toBeGreaterThanOrEqual(main.x);
  await removeTall(page);
  await scrollMain(page, 'top');
});

test('answering from the bar turns Submit on, and a desktop-sized window gets the screen it always had', async () => {
  await answerQuestions(page);
  await expect(page.getByRole('button', { name: 'Submit exam' })).toBeEnabled();
  await expect(page.getByText('Question 3 of 3 · 3 answered')).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  // The desktop layout is marked too (so the page lets it stick), and its one clock sits in a sticky title row.
  await expect(page.locator('[data-exam-attempt]')).toHaveCount(1);
  await expect(page.getByRole('timer')).toHaveCount(1);
  await expect(page.locator('[data-exam-attempt] > .sticky').getByRole('timer')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Questions,/ }), 'no carousel bar on a desktop-sized window').toHaveCount(0);
  await expect(page.getByText('Answered 3 of 3')).toBeVisible();

  await page.getByRole('button', { name: 'Submit exam' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit exam' }).click();
  await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a?.status === 'submitted');
});
