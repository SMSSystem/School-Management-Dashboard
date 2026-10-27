import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK } from './lesson-notes-support';
import { box, createOnlineExam, EXAM_PREFIX, examByTitle, hideDevToggle, importQuestions, loginAs, poll, QUESTIONS_CSV, subDoc, sweepQaExams } from './exams-support';

// The exam builder as a carousel, against the live QA institution: one question editor at a time with a strip (where the
// editor is, Previous, Next, Add question); on a phone a Questions sheet, a count of the questions that need attention and a
// More menu; from md up a rail beside the editor with the questions, their problems and their moves. Adding, deleting,
// duplicating and moving keep the right question chosen. Nothing is saved (the draft is thrown away at the end), so the
// exam keeps its three questions.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} builder carousel ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
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

const where = (n: number, of: number) => page.getByText(`Question ${n} of ${of}`, { exact: true });
const sheet = () => page.getByRole('dialog', { name: 'Questions' });
const questionsButton = () => page.getByRole('button', { name: /^Questions,/ });
const rail = () => page.getByRole('navigation', { name: 'Questions' });
const editorHeadings = () => page.getByRole('heading', { name: /^Question \d/ });
const text = () => page.getByLabel('Question text');

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

test('on a phone one editor shows at a time, chosen from the strip or the Questions sheet', async ({ browser }) => {
  await context.close();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await forceLiveData(context);
  page = await context.newPage();
  // A reload with unsaved changes raises the browser's own prompt; accept it.
  page.on('dialog', (dialog) => void dialog.accept());
  await loginAs(page, 'teacher');
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await expect(where(1, 3)).toBeVisible({ timeout: 30_000 });
  await hideDevToggle(page);

  await expect(editorHeadings(), 'one editor, not the whole list').toHaveCount(1);
  await expect(rail(), 'the rail is for md and up').toHaveCount(0);
  await expect(questionsButton()).toHaveAccessibleName('Questions, 3');
  await expect(text()).toHaveValue(/closest to the sun/);

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(where(2, 3)).toBeVisible();
  await expect(text()).toHaveValue(/prime numbers/);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(where(1, 3)).toBeVisible();

  await questionsButton().click();
  await expect(sheet()).toBeVisible();
  await expect(sheet().getByRole('button', { name: /prime numbers/ })).toBeVisible();
  await expect(sheet().getByRole('button', { name: /Needs attention \(0\)/ })).toBeDisabled();
  await expect(sheet().getByText('Move question', { exact: false }), 'the sheet has no moves').toHaveCount(0);
  await sheet().getByRole('button', { name: /3 \+ 4/ }).click();
  await expect(sheet()).toBeHidden();
  await expect(where(3, 3)).toBeVisible();
});

test('Add question in the strip appends and chooses the new question, whose problems are counted', async () => {
  await page.getByRole('button', { name: 'Add question' }).first().click();
  await expect(where(4, 4)).toBeVisible();
  await expect(text()).toHaveValue('');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(page.getByRole('button', { name: '1 question needs attention' })).toBeVisible();
  await expect(questionsButton()).toHaveAccessibleName('Questions, 1 need attention');

  await page.getByRole('button', { name: '1 question needs attention' }).click();
  await expect(sheet()).toBeVisible();
  await expect(sheet().getByRole('button', { name: /Needs attention \(1\)/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet().getByRole('button', { name: /\(no text yet\)/ })).toBeVisible();
  await expect(sheet().getByText('has problems')).toHaveCount(1);
  await expect(sheet().getByRole('button', { name: /prime numbers/ }), 'only the questions that need attention').toHaveCount(0);
  await sheet().getByRole('button', { name: 'Close' }).click();
  await expect(sheet()).toBeHidden();
});

test('delete, move and duplicate keep the right question chosen', async () => {
  await test.step('delete the last question: the one before is chosen', async () => {
    await page.getByRole('button', { name: 'Delete question 4' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete question' }).click();
    await expect(where(3, 3)).toBeVisible();
    await expect(page.getByRole('button', { name: /needs? attention/ })).toHaveCount(0);
  });

  await test.step('move the chosen question up: it stays chosen at its new place', async () => {
    await page.getByRole('button', { name: 'Move question 3 up' }).click();
    await expect(where(2, 3)).toBeVisible();
    await expect(text()).toHaveValue(/3 \+ 4/);
  });

  await test.step('duplicate it: the copy is chosen', async () => {
    await page.getByRole('button', { name: 'Duplicate question 2' }).click();
    await expect(where(3, 4)).toBeVisible();
    await expect(text()).toHaveValue(/3 \+ 4/);
  });
});

test('the strip sticks while the editor is scrolled, and the toolbar keeps its secondary buttons in a More menu', async () => {
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.id = 'e2e-spacer';
    spacer.style.height = '2500px';
    // Inside the column that holds the strip and the editor, so the page is tall where the strip sticks.
    document.querySelector('textarea')?.closest('article')?.parentElement?.appendChild(spacer);
    const main = document.querySelector('main')!;
    main.scrollTop = main.scrollHeight;
  });
  const main = await box(page.locator('main'));
  const strip = await box(page.getByRole('button', { name: 'Next', exact: true }));
  expect(strip.y, 'the strip stays at the top of the scrolling area').toBeGreaterThanOrEqual(main.y - 1);
  expect(strip.y).toBeLessThanOrEqual(main.y + 70);
  await page.evaluate(() => {
    document.getElementById('e2e-spacer')?.remove();
    document.querySelector('main')!.scrollTop = 0;
  });

  await expect(page.getByRole('button', { name: 'Import from file' }), 'Import is in the menu on a phone').toHaveCount(0);
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByRole('menuitem', { name: 'Import from file' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Preview as student' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Results' }), 'a draft has no results').toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  await test.step('Preview in the menu still asks before leaving with unsaved changes', async () => {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Preview as student' }).click();
    const asking = page.getByRole('dialog', { name: 'Leave without saving?' });
    await expect(asking).toBeVisible();
    await asking.getByRole('button', { name: 'Stay' }).click();
    await expect(asking).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${state.examId}/build$`));
  });
});

test('a tablet held upright and a desktop get the rail, with the questions, their problems and their moves', async () => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(rail()).toBeVisible();
  await expect(questionsButton(), 'the sheet button is for phones').toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More' }), 'the toolbar keeps its own buttons').toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import from file' })).toBeVisible();
  await expect(rail().getByRole('button', { name: /prime numbers/ })).toBeVisible();

  await test.step('choose a question in the rail', async () => {
    await rail().getByRole('button', { name: /closest to the sun/ }).click();
    await expect(where(1, 4)).toBeVisible();
    await expect(text()).toHaveValue(/closest to the sun/);
  });

  await test.step('move it down from the rail: it stays chosen', async () => {
    await rail().getByRole('button', { name: 'Move question 1 down' }).click();
    await expect(where(2, 4)).toBeVisible();
    await expect(text()).toHaveValue(/closest to the sun/);
  });

  await test.step('a question that needs attention is marked, and the count picks it in the rail', async () => {
    await page.getByRole('button', { name: 'Add question' }).first().click();
    await expect(where(5, 5)).toBeVisible();
    await expect(rail().getByText('has problems')).toHaveCount(1);
    await page.getByRole('button', { name: 'Question 1' }).first().isVisible().catch(() => false);
    await rail().getByRole('button', { name: /closest to the sun/ }).click();
    await page.getByRole('button', { name: '1 question needs attention' }).click();
    await expect(where(5, 5)).toBeVisible();
    await expect(rail().getByRole('button', { name: /Needs attention \(1\)/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(rail().getByRole('button', { name: /prime numbers/ })).toHaveCount(0);
    await expect(sheet(), 'no sheet on a computer').toHaveCount(0);
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(rail()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import from file' })).toBeVisible();
});

test('nothing was saved: the exam still has its three questions', async () => {
  const saved = await subDoc(state.examId, 'content', 'questions');
  expect((saved?.items as unknown[]).length).toBe(3);
});
