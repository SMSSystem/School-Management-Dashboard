import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK, userByEmail } from './lesson-notes-support';
import { createOnlineExam, EXAM_PREFIX, examByTitle, hideDevToggle, importQuestions, loginAs, poll, QUESTIONS_CSV, subDoc, sweepQaExams, swipe } from './exams-support';

// An Unsupervised exam with Forward only ticked, sat by a student, against the live QA institution: a question cannot be
// skipped (Next is off until it has an answer, and says so), a question left cannot be reached again (Previous and the
// numbered buttons are off), and Submit is off, with how many are left, until the last answer. The rules that accept the
// exam's `integrity` and `forwardOnly` fields must be DEPLOYED (`npm run firebase:deploy:rules`) or the teacher's save is
// refused.
//
// Playwright cannot show what a phone or a real fullscreen does; the fullscreen request is made and ignored here.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} forward only ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
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

const next = () => page.getByRole('button', { name: 'Next', exact: true });
const submit = () => page.getByRole('button', { name: 'Submit exam' });

test('the teacher builds an Unsupervised, Forward only exam and publishes it', async () => {
  await loginAs(page, 'teacher');
  await createOnlineExam(page, TITLE, { unsupervised: true, forwardOnly: true });
  await poll(() => examByTitle(TITLE), (e) => e !== null);
  const exam = (await examByTitle(TITLE))!;
  state.examId = exam.id;
  expect(exam.data).toMatchObject({ integrity: 'unsupervised', forwardOnly: true });
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await importQuestions(page, QUESTIONS_CSV);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await poll(() => subDoc(state.examId, 'content', 'questions'), (q) => Array.isArray(q?.items) && (q!.items as unknown[]).length === 3);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Confirm' }).getByRole('button', { name: /^Yes, publish$/ }).click();
  await poll(async () => (await examByTitle(TITLE))?.data.status, (s) => s === 'published');
});

test('the student is told to answer each question, cannot skip one or go back, and submits only after the last answer', async ({ browser }) => {
  // The student signs in on a fresh browser context; the teacher's is closed.
  await context.close();
  context = await browser.newContext();
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, 'studentA');
  await page.goto('/dashboard/list/exams');
  await page.getByRole('link', { name: `Start ${TITLE}` }).click();
  await expect(page.getByText('each one must be answered before you move to the next')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 30_000 });

  await test.step('question 1: nothing can be skipped, nothing is behind', async () => {
    await expect(next()).toBeDisabled();
    await expect(page.getByText('Choose an answer to continue')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await expect(submit()).toBeDisabled();
    await expect(page.getByText('Answer all questions to submit (3 left)')).toBeVisible();
  });

  await test.step('answering turns Next on, and it goes one question on', async () => {
    await page.getByRole('radio', { name: 'Mercury', exact: true }).check();
    await expect(next()).toBeEnabled();
    await expect(page.getByText('Choose an answer to continue')).toHaveCount(0);
    await next().click();
    await expect(page.getByText('Question 2 of 3')).toBeVisible();
  });

  await test.step('question 2: the one left is shut, Next waits for an answer again', async () => {
    await expect(page.getByRole('button', { name: 'Question 1, answered, already left, you cannot go back' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await expect(next()).toBeDisabled();

    // On a phone-sized window a swipe is held to the same rule as the buttons: no way back, and no way on without an answer.
    // An Unsupervised exam asked for fullscreen when it started, and a window in fullscreen cannot be resized.
    await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined));
    await page.setViewportSize({ width: 390, height: 844 });
    await hideDevToggle(page);
    await expect(page.getByText('Question 2 of 3 · 1 answered')).toBeVisible();
    await swipe(page, 'left');
    await page.waitForTimeout(400);
    await expect(page.getByText('Question 2 of 3 · 1 answered'), 'a swipe forward is refused until the question is answered').toBeVisible();
    await swipe(page, 'right');
    await page.waitForTimeout(400);
    await expect(page.getByText('Question 2 of 3 · 1 answered'), 'a swipe back is always refused').toBeVisible();
    await page.getByRole('checkbox', { name: '2', exact: true }).check();
    await page.getByRole('checkbox', { name: '5', exact: true }).check();
    await swipe(page, 'right');
    await page.waitForTimeout(400);
    await expect(page.getByText('Question 2 of 3 · 2 answered'), 'still no way back once it is answered').toBeVisible();
    await swipe(page, 'left');
    await expect(page.getByText('Question 3 of 3 · 2 answered'), 'a swipe forward works once the question is answered').toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByText('Question 3 of 3')).toBeVisible();
  });

  await test.step('on a phone the list of questions is a sheet that only shows where the student is', async () => {
    // An Unsupervised exam asked for fullscreen when it started, and a window in fullscreen cannot be resized.
    await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined));
    await page.setViewportSize({ width: 390, height: 844 });
    await hideDevToggle(page);
    await page.getByRole('button', { name: /^Questions,/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Questions' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Question 1, answered, already left, you cannot go back' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Question 2, answered, already left, you cannot go back' })).toBeDisabled();
    await expect(sheet.getByRole('button', { name: 'Question 3, not answered' })).toHaveAttribute('aria-current', 'true');
    await expect(sheet.getByText('Questions you have left cannot be opened again.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await test.step('question 3: Submit stays off until it is answered, then goes through', async () => {
    await expect(submit()).toBeDisabled();
    await expect(page.getByText('Answer all questions to submit (1 left)')).toBeVisible();
    await page.getByRole('radio', { name: '7', exact: true }).check();
    await expect(submit()).toBeEnabled();
    await submit().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Submit exam' }).click();
    await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a?.status === 'submitted');
  });
});
