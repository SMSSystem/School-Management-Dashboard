import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK } from './lesson-notes-support';
import { createOnlineExam, EXAM_PREFIX, examByTitle, hideDevToggle, loginAs, poll, sweepQaExams } from './exams-support';

// The staff Exams list as cards on a phone, against the live QA institution: a card per exam with the table's facts, buttons of
// 44 px that open the builder, the preview, the exam form and the delete dialog, and the table back on a computer. The exam
// is built on a desktop-sized window; a phone-sized one then reads the list. A real phone is a manual check.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} list cards ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
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

const card = () => page.locator('li', { hasText: TITLE });

test('the teacher creates an online exam', async () => {
  await loginAs(page, 'teacher');
  await createOnlineExam(page, TITLE);
  await poll(() => examByTitle(TITLE), (e) => e !== null);
  state.examId = (await examByTitle(TITLE))!.id;
});

test('on a phone the list is a card per exam with the facts of the table row', async ({ browser }) => {
  await context.close();
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await forceLiveData(context);
  page = await context.newPage();
  await loginAs(page, 'teacher');
  await page.goto('/dashboard/list/exams');
  await expect(card()).toBeVisible({ timeout: 30_000 });
  await hideDevToggle(page);

  await expect(page.locator('table'), 'cards, not the table').toHaveCount(0);
  await expect(card().getByText('Online', { exact: true })).toBeVisible();
  await expect(card().getByText('Draft', { exact: true })).toBeVisible();
  await expect(card().getByText('Multiple Choice').or(card().getByText('Quiz'))).toBeVisible();
  await expect(card()).toContainText('QA Assignments Class');
  await expect(card()).toContainText('QaLessons');
  await expect(card()).toContainText(/\d{4}/);
});

test('the card’s buttons are at least 44 px and open the builder, the preview, the form and the delete dialog', async () => {
  for (const name of ['Build questions', 'Preview as student', 'Duplicate exam']) {
    const button = card().getByRole(name === 'Duplicate exam' ? 'button' : 'link', { name });
    await expect(button, name).toBeVisible();
    const b = (await button.boundingBox())!;
    expect(Math.min(b.width, b.height), `${name} is big enough for a finger`).toBeGreaterThanOrEqual(43);
  }
  const edit = card().getByRole('button', { name: /^Edit/ });
  const editBox = (await edit.boundingBox())!;
  expect(Math.min(editBox.width, editBox.height)).toBeGreaterThanOrEqual(43);

  await test.step('Edit opens the exam form', async () => {
    await edit.click();
    await expect(page.locator('input[name="title"]')).toHaveValue(TITLE);
    await page.getByRole('button', { name: 'Close' }).first().click().catch(() => page.keyboard.press('Escape'));
    await expect(page.locator('input[name="title"]')).toHaveCount(0);
  });

  await test.step('Preview as student opens the preview', async () => {
    await card().getByRole('link', { name: 'Preview as student' }).click();
    await expect(page).toHaveURL(new RegExp(`${state.examId}/preview$`));
    await page.goBack();
    await expect(card()).toBeVisible();
  });

  await test.step('Build questions opens the builder', async () => {
    await card().getByRole('link', { name: 'Build questions' }).click();
    await expect(page).toHaveURL(new RegExp(`${state.examId}/build$`));
    await page.goBack();
    await expect(card()).toBeVisible();
  });
});

test('a computer-sized window gets the table back, with its columns', async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('table')).toBeVisible();
  const row = page.locator('tr', { hasText: TITLE });
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Build questions' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Teacher' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible();
  const b = (await row.getByRole('link', { name: 'Build questions' }).boundingBox())!;
  expect(b.width, 'the table keeps its small buttons').toBeLessThan(40);
});
