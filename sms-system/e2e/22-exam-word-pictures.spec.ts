import { test, expect } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK } from './lesson-notes-support';
import { bytesOfDataUrl, createOnlineExam, EXAM_PREFIX, examByTitle, loginAs, packDoc, pngParts, poll, subDoc, sweepQaExams } from './exams-support';
import { WORD_ALT, WORD_TOOL_PNG, docxWithPictures } from './word-pictures-support';

// Importing a Word file with pictures, end to end (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.1 and §8.4)
// against the live QA institution, with the picture-pack rules DEPLOYED (`npm run firebase:deploy:rules`): a teacher imports
// a .docx that has a picture above question 1, one under question 1's text and one after question 2's options; the picture
// step shows Clear, Check and No question; Continue waits for the Check picture; the pictures arrive on their questions
// with Word's descriptions; Save writes one pack holding the two used pictures, cleaned. The real canvas path (a picture
// that fits needs none, so the picture check runs on the cleaned bytes) and a real Word paper stay manual checks.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} word ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
const state: { examId: string } = { examId: '' };

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required (ground-truth reads)');
  test.skip(!process.env.QA_ADMIN_EMAIL, 'QA_ADMIN_* missing from .env.qa');
  await sweepQaExams();
});

test.afterAll(async () => {
  if (HAS_ADMIN_SDK) await sweepQaExams();
});

test('a teacher imports a Word file, decides its pictures and saves', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await createOnlineExam(page, TITLE);
  await poll(() => examByTitle(TITLE), (e) => e !== null);
  state.examId = (await examByTitle(TITLE))!.id;
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);

  await page.getByRole('button', { name: 'Import from file' }).click();
  await page.locator('#exam-import-file').setInputFiles({
    name: 'questions.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(docxWithPictures()),
  });
  await expect(page.getByRole('status').filter({ hasText: '3 questions found' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Review the pictures' }).click();

  // The picture step: three pictures, each with its badge, checked one at a time.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Pictures in the file' })).toBeVisible();
  const cards = dialog.getByRole('list', { name: 'Pictures in the file' }).getByRole('listitem');
  await expect(cards).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Use all clear ones' })).toBeEnabled({ timeout: 60_000 });
  await expect(cards.filter({ hasText: 'No question' })).toContainText('It will not be imported');
  await expect(cards.filter({ hasText: 'Clear' })).toContainText('kept exactly');
  await expect(cards.filter({ hasText: 'Check' })).toContainText('Needs a decision');

  const next = dialog.getByRole('button', { name: 'Review in the builder' });
  await expect(next, 'a Check picture is still undecided').toBeDisabled();
  await dialog.getByRole('button', { name: 'Use all clear ones' }).click();
  await expect(next, 'the Check picture still needs a decision').toBeDisabled();
  await cards.filter({ hasText: 'Check' }).getByRole('button', { name: 'Use', exact: true }).click();
  await expect(next).toBeEnabled();
  await expect(dialog.getByRole('status')).toContainText('2 will be used');
  await next.click();

  // The questions are in the builder with their pictures and Word's descriptions, unsaved.
  await expect(page.getByRole('status').filter({ hasText: '3 questions imported with 2 pictures' })).toBeVisible();
  // The builder shows one question at a time: the first one's picture, then the second's, then the third has none.
  await expect(page.getByRole('img', { name: WORD_ALT.tool })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('img', { name: WORD_ALT.option })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('img', { name: WORD_ALT.badge })).toHaveCount(0);
  await expect(page.getByText(/^2 pictures: about /)).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({ timeout: 60_000 });

  expect((await examByTitle(TITLE))!.data).toMatchObject({ questionCount: 3, imagePacks: 1 });
  const questions = (await subDoc(state.examId, 'content', 'questions'))!.items as { image?: Record<string, unknown> }[];
  expect(questions[0].image).toMatchObject({ pack: 1, alt: WORD_ALT.tool, exact: true });
  expect(questions[1].image).toMatchObject({ pack: 1, alt: WORD_ALT.option });
  expect(questions[2].image).toBeUndefined();

  const pack = (await packDoc(state.examId, 1))!;
  expect(Object.keys(pack.images), 'the picture above question 1 was not stored').toHaveLength(2);
  const tool = pack.images[(questions[0].image as { id: string }).id];
  const kept = pngParts(bytesOfDataUrl(tool.data));
  expect(kept.types, 'the text chunk with the place was not stored').not.toContain('tEXt');
  expect(kept.pixels.equals(pngParts(WORD_TOOL_PNG).pixels), 'the pixels are the original ones').toBe(true);
});

test('the preview shows both pictures on their questions', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(`/dashboard/list/exams/${state.examId}/preview`);
  await expect(page.getByRole('img', { name: WORD_ALT.tool })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('img', { name: WORD_ALT.option })).toBeVisible();
});
