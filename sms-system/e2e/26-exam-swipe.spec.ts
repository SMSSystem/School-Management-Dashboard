import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK, userByEmail } from './lesson-notes-support';
import { EXAM_PREFIX, QUESTIONS_CSV, createOnlineExam, examByTitle, hideDevToggle, importQuestions, loginAs, subDoc, swipe, sweepQaExams } from './exams-support';

// Swiping between the questions of the attempt screen in the carousel layout, against the live QA institution: a swipe left
// goes to the next question and a swipe right to the one before, the question the student has arrived at is announced and
// takes focus, the new question slides in when the device allows motion and swaps at once when it asks for less, and a
// gesture that is not a swipe (mostly vertical, or at either end) does nothing. A forward-only exam holds a swipe to the same
// rule as the buttons: that is in e2e/24. The swipes are touch events sent through the browser's DevTools Protocol, so what a
// real finger on a real phone feels like (speed, the address bar, the edge-swipe back gesture) is a manual check.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} swipe ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
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

const announcement = () => page.locator('[aria-roledescription="carousel"] > p[role="status"]');
const heading = () => page.locator('h2[data-question-heading]');
const slide = () => page.locator('[data-slide]');
const where = (n: number, answered = 0) => page.getByText(`Question ${n} of 3 · ${answered} answered`);

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

test('on a phone a swipe goes to the next question and back, and is announced', async ({ browser }) => {
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

  await expect(where(1)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Exam questions' })).toHaveAttribute('aria-roledescription', 'carousel');
  await expect(announcement(), 'nothing is announced on arrival').toHaveText('');

  await swipe(page, 'left');
  await expect(where(2)).toBeVisible();
  await expect(announcement()).toHaveText('Question 2 of 3');
  await expect(heading(), 'focus follows to the new question').toBeFocused();
  await expect(heading()).toContainText('Question 2 of 3');

  await swipe(page, 'right');
  await expect(where(1)).toBeVisible();
  await expect(announcement()).toHaveText('Question 1 of 3');
  await expect(heading()).toBeFocused();
});

test('a swipe that leads nowhere, or is mostly vertical, does nothing', async () => {
  await swipe(page, 'right');
  await page.waitForTimeout(500);
  await expect(where(1), 'there is nothing before the first question').toBeVisible();
  await swipe(page, 'down');
  await page.waitForTimeout(500);
  await expect(where(1), 'a mostly vertical movement is a scroll').toBeVisible();
});

test('the question slides in when motion is allowed and swaps at once when the device asks for less', async () => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await swipe(page, 'left');
  await expect(where(2)).toBeVisible();
  await expect(slide()).toHaveAttribute('data-slide', 'forward');
  expect(await slide().evaluate((el) => getComputedStyle(el).animationName)).toBe('exam-slide-forward');

  await swipe(page, 'right');
  await expect(where(1)).toBeVisible();
  await expect(slide()).toHaveAttribute('data-slide', 'back');
  expect(await slide().evaluate((el) => getComputedStyle(el).animationName)).toBe('exam-slide-back');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await swipe(page, 'left');
  await expect(where(2)).toBeVisible();
  await expect(slide()).toHaveAttribute('data-slide', 'forward');
  expect(await slide().evaluate((el) => getComputedStyle(el).animationName), 'less motion means no slide').toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
});

test('a jump of more than one question from the list only fades, and a swipe over an open sheet does nothing', async () => {
  await swipe(page, 'right');
  await expect(where(1)).toBeVisible();
  await page.getByRole('button', { name: /^Questions,/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Questions' });
  await expect(sheet).toBeVisible();
  await swipe(page, 'left', 600);
  await page.waitForTimeout(500);
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /^Question 3,/ }).click();
  await expect(sheet).toBeHidden();
  await expect(where(3)).toBeVisible();
  await expect(slide()).toHaveAttribute('data-slide', 'jump');
  await expect(announcement()).toHaveText('Question 3 of 3');
  await expect(heading()).toBeFocused();

  await page.getByRole('button', { name: /^Questions,/ }).click();
  await sheet.getByRole('button', { name: /^Question 1,/ }).click();
  await expect(where(1)).toBeVisible();
  await expect(slide()).toHaveAttribute('data-slide', 'jump');
});

test('the answers survive the swipes, and the exam can be submitted', async () => {
  // The element that switches off copying on the questions is not replaced when a new question slides in.
  expect(await page.evaluate(() => {
    const copy = new Event('copy', { bubbles: true, cancelable: true });
    document.querySelector('h2[data-question-heading]')!.dispatchEvent(copy);
    return copy.defaultPrevented;
  })).toBe(true);
  await page.getByRole('radio', { name: 'Mercury', exact: true }).check();
  await swipe(page, 'left');
  await expect(where(2, 1)).toBeVisible();
  await page.getByRole('checkbox', { name: '2', exact: true }).check();
  await page.getByRole('checkbox', { name: '5', exact: true }).check();
  await swipe(page, 'left');
  await expect(where(3, 2)).toBeVisible();
  await page.getByRole('radio', { name: '7', exact: true }).check();
  await page.getByRole('button', { name: 'Submit exam' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit exam' }).click();
  await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a?.status === 'submitted');
});
