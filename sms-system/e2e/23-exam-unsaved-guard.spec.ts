import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK } from './lesson-notes-support';
import { EXAM_PREFIX, QUESTIONS_CSV, createOnlineExam, examByTitle, importQuestions, loginAs, subDoc, sweepQaExams } from './exams-support';

// The unsaved-changes guard of the exam builder, end to end against the live QA institution: a teacher with changes that are
// not saved is asked before Preview as student, a sidebar link, the browser's Back button, Sign out and Start Tour; Stay keeps
// the page and the changes, Leave goes; once the changes are saved nothing asks. Saving writes the exam's questions, which the
// rules deployed today accept (no pictures here).
//
// The guard is built from a click listener on the document and a marker entry in the history (components/NavigationGuardProvider.tsx).
// Safari's swipe-back gesture, a phone's Back key and closing the tab are manual checks, not covered here.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} unsaved guard ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
const state = { examId: '' };

// One teacher signs in once and uses one page for every test (six sign-ins in a row make the live sign-in slow and flaky).
let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required (ground-truth reads)');
  test.skip(!process.env.QA_ASSIGNMENTS_STUDENT_EMAIL || !process.env.QA_ADMIN_EMAIL, 'QA_* missing from .env.qa');
  await sweepQaExams();
  context = await browser.newContext();
  await forceLiveData(context);
  page = await context.newPage();
  // A reload with unsaved changes raises the browser's own prompt; the tests that start over accept it.
  page.on('dialog', (dialog) => void dialog.accept());
  await loginAs(page, 'teacher');
});

test.afterAll(async () => {
  await context?.close();
  if (HAS_ADMIN_SDK) await sweepQaExams();
});

const asking = (page: Page) => page.getByRole('dialog', { name: 'Leave without saving?' });
const buildUrl = () => `/dashboard/list/exams/${state.examId}/build`;

/** The builder with three imported questions that are not saved. */
async function dirtyBuilder(page: Page) {
  await page.goto(buildUrl());
  await importQuestions(page, QUESTIONS_CSV);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  // The guard has put its marker entry in the history (a person cannot press Back faster than this; a script can).
  await page.waitForFunction(() => (history.state as { usr?: { examGuard?: boolean } } | null)?.usr?.examGuard === true);
}

async function stay(page: Page) {
  await expect(asking(page)).toBeVisible();
  await asking(page).getByRole('button', { name: 'Stay' }).click();
  await expect(asking(page)).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${state.examId}/build$`));
  await expect(page.getByText('Unsaved changes')).toBeVisible();
}

test('the teacher creates an online exam', async () => {
  await createOnlineExam(page, TITLE);
  await expect.poll(async () => (await examByTitle(TITLE)) !== null, { timeout: 30_000 }).toBe(true);
  state.examId = (await examByTitle(TITLE))!.id;
});

test('nothing asks while nothing is unsaved', async () => {
  await page.goto(buildUrl());
  await expect(page.getByRole('link', { name: 'Preview as student' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Preview as student' }).click();
  await expect(page).toHaveURL(new RegExp(`${state.examId}/preview$`));
  await expect(asking(page)).toBeHidden();
});

test('with unsaved changes, Preview, the sidebar, Back, Sign out and Start Tour ask, and Stay keeps everything', async () => {
  await dirtyBuilder(page);

  await test.step('Preview as student', async () => {
    await page.getByRole('link', { name: 'Preview as student' }).click();
    await stay(page);
  });

  await test.step('a link in the sidebar', async () => {
    await page.locator('aside a[href="/dashboard"]').first().click();
    await stay(page);
  });

  await test.step('the browser Back button, twice, asks each time and stays on the page', async () => {
    await page.goBack();
    await stay(page);
    await page.goBack();
    await stay(page);
  });

  await test.step('Sign out', async () => {
    await page.getByRole('button', { name: 'Sign out' }).click();
    await stay(page);
  });

  await test.step('Start Tour', async () => {
    await page.getByRole('button', { name: 'Start Tour' }).click();
    await stay(page);
  });

  await test.step('the three imported questions are still there', async () => {
    await expect(page.getByRole('heading', { name: /^Question \d/ })).toHaveCount(3);
  });
});

test('Leave goes where the link was going, and the unsaved questions are not saved', async () => {
  await dirtyBuilder(page);
  await page.getByRole('link', { name: 'Preview as student' }).click();
  await asking(page).getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(new RegExp(`${state.examId}/preview$`));
  expect(await subDoc(state.examId, 'content', 'questions')).toBeNull();
  // Back from the preview is the builder, once, as if the guard had not been there.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${state.examId}/build$`));
});

test('Leave by the Back button goes to the page before the builder', async () => {
  await page.goto('/dashboard/list/exams');
  await page.goto(buildUrl());
  await importQuestions(page, QUESTIONS_CSV);
  await page.waitForFunction(() => (history.state as { usr?: { examGuard?: boolean } } | null)?.usr?.examGuard === true);
  // Chrome skips a history entry a page added without any click or key press since, so, as a person would, touch the page.
  await page.getByRole('heading', { name: TITLE }).click();
  await page.goBack();
  await asking(page).getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(/\/dashboard\/list\/exams$/);
});

test('once the changes are saved, Preview goes straight through and shows the saved questions', async () => {
  await dirtyBuilder(page);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => ((await subDoc(state.examId, 'content', 'questions'))?.items as unknown[] | undefined)?.length, { timeout: 30_000 }).toBe(3);
  await expect(page.getByText('Unsaved changes')).toBeHidden();
  await page.getByRole('link', { name: 'Preview as student' }).click();
  await expect(page).toHaveURL(new RegExp(`${state.examId}/preview$`));
  await expect(asking(page)).toBeHidden();
  await expect(page.getByText('Question 1 of 3')).toBeVisible({ timeout: 30_000 });
});
