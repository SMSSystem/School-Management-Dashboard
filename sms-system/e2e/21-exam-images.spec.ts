import { test, expect, type Page } from '@playwright/test';
import { doc, getDoc } from 'firebase/firestore';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK, expectDenied, openProbe, userByEmail } from './lesson-notes-support';
import { answerQuestions, bytesOfDataUrl, confirm, createOnlineExam, EXAM_PREFIX, examByTitle, importQuestions, institutionId, localDate, localInput, loginAs, packDoc, pngParts, poll, QUESTIONS_CSV, subCount, subDoc, sweepQaExams } from './exams-support';
import { TEXT_CHUNK, buildPng } from '../src/lib/__tests__/imageFixtures';

// Pictures in exam questions, end to end (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §3 to §6) against the
// live QA institution, with the rules for the picture packs DEPLOYED (`npm run firebase:deploy:rules`): a teacher puts a
// picture on a question, saves and publishes; the stored pack lost the picture's private chunk and kept its pixels; a
// student and a parent cannot read the pack before an attempt, the student sees the picture and enlarges it, and cannot
// read the pack again once the attempt is handed in; the preview shows it; Duplicate copies it; Delete removes the packs.
// A real phone, pinch-zoom and a slow connection are a manual check.

test.describe.configure({ mode: 'serial' });

const TITLE = `${EXAM_PREFIX} diagram ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
const COPY_TITLE = `${TITLE} copy`;
const ALT = 'A vice clamped to a workbench';
const state: { examId: string; copyId: string; studentUid: string } = { examId: '', copyId: '', studentUid: '' };
const studentEmail = process.env.QA_ASSIGNMENTS_STUDENT_EMAIL;

// 160 x 100 pixels, 8-bit RGB, with a text chunk that says where it was taken (which must not be stored).
const PICTURE = buildPng({ width: 160, height: 100, extra: [TEXT_CHUNK] });

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required (ground-truth reads)');
  test.skip(!studentEmail || !process.env.QA_ADMIN_EMAIL, 'QA_ASSIGNMENTS_STUDENT_* / QA_ADMIN_* missing from .env.qa');
  state.studentUid = (await userByEmail(studentEmail!)).uid;
  await sweepQaExams();
});

test.afterAll(async () => {
  if (HAS_ADMIN_SDK) await sweepQaExams();
});

const statusOf = async () => (await examByTitle(TITLE))?.data.status;

/** Delete exam on a row of the list, as the administrator: the confirmation names the packs, then the exam is gone. */
async function deleteFromList(page: Page, title: string) {
  await page.goto('/dashboard/list/exams');
  await page.locator('tr', { hasText: title }).getByRole('button', { name: 'Delete exam' }).click();
  await expect(page.getByText(/Its questions, pictures and answer key go with it.*1 picture pack/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await poll(() => examByTitle(title), (e) => e === null, 60_000);
}

test('the teacher puts a picture on a question, saves and publishes, and the stored pack is clean', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await createOnlineExam(page, TITLE);
  await poll(() => examByTitle(TITLE), (e) => e !== null);
  state.examId = (await examByTitle(TITLE))!.id;
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await importQuestions(page, QUESTIONS_CSV);

  await page.locator('input[type="file"][accept^="image/png"]').first().setInputFiles({ name: 'vice.png', mimeType: 'image/png', buffer: Buffer.from(PICTURE) });
  await expect(page.getByText(/160 × 100 px · .*kept exactly/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/^Alt text/).first().fill(ALT);
  await expect(page.getByText(/^1 picture: about /)).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await confirm(page, /^Yes, publish$/);
  await poll(statusOf, (s) => s === 'published');

  const exam = (await examByTitle(TITLE))!.data;
  expect(exam).toMatchObject({ questionCount: 3, imagePacks: 1 });
  expect(exam.imageBytes as number).toBeGreaterThan(0);
  const questions = (await subDoc(state.examId, 'content', 'questions'))!.items as { image?: Record<string, unknown> }[];
  expect(questions[0].image).toMatchObject({ pack: 1, w: 160, h: 100, exact: true, alt: ALT });
  expect(questions[1].image).toBeUndefined();

  const pack = (await packDoc(state.examId, 1))!;
  const [stored] = Object.entries(pack.images);
  expect(Object.keys(pack.images), 'one picture in the pack').toHaveLength(1);
  expect(stored[0]).toBe((questions[0].image as { id: string }).id);
  expect(stored[1].mime).toBe('image/png');
  const kept = pngParts(bytesOfDataUrl(stored[1].data));
  const original = pngParts(PICTURE);
  expect(kept.types, 'the text chunk with the place was not stored').not.toContain('tEXt');
  expect(kept.types).toContain('IDAT');
  expect(kept.pixels.equals(original.pixels), 'the pixels are the original ones').toBe(true);
});

test('a student and a parent cannot read the pack before an attempt', async () => {
  const iid = await institutionId();
  const student = await openProbe(process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
  const parent = await openProbe(process.env.QA_ASSIGNMENTS_PARENT_EMAIL!, process.env.QA_ASSIGNMENTS_PARENT_PASSWORD!);
  try {
    const pack = `institutions/${iid}/exams/${state.examId}/content/images_1`;
    await expectDenied('the student reads a picture pack before starting an attempt', getDoc(doc(student.db, pack)));
    await expectDenied('a parent reads a picture pack', getDoc(doc(parent.db, pack)));
  } finally {
    await student.close();
    await parent.close();
  }
});

test('the student sees the picture, enlarges it, answers and submits, and then cannot read the pack', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'studentA');
  await page.goto('/dashboard/list/exams');
  await page.getByRole('link', { name: `Start ${TITLE}` }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 30_000 });

  const picture = page.getByRole('img', { name: ALT });
  await expect(picture).toBeVisible({ timeout: 30_000 });
  await expect(picture).toHaveAttribute('draggable', 'false');
  await expect(page.getByText('Loading the picture…')).toHaveCount(0);

  const enlarge = page.getByRole('button', { name: 'Enlarge picture' });
  await enlarge.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('img', { name: ALT })).toBeVisible();
  await dialog.getByRole('button', { name: 'Actual size' }).click();
  await expect(dialog.getByRole('button', { name: 'Fit to screen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(enlarge, 'the focus goes back to the picture').toBeFocused();

  await answerQuestions(page);
  await page.getByRole('button', { name: 'Submit exam' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit exam' }).click();
  await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a?.status === 'submitted');

  const iid = await institutionId();
  const student = await openProbe(process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
  try {
    await expectDenied('the student reads the pack after handing in', getDoc(doc(student.db, `institutions/${iid}/exams/${state.examId}/content/images_1`)));
  } finally {
    await student.close();
  }
});

test('the preview shows the picture, and Duplicate copies it into the new exam', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(`/dashboard/list/exams/${state.examId}/preview`);
  await expect(page.getByRole('img', { name: ALT })).toBeVisible({ timeout: 30_000 });

  await page.goto('/dashboard/list/exams');
  await page.locator('tr', { hasText: TITLE }).getByRole('button', { name: 'Duplicate exam' }).click();
  await page.locator('input[name="title"]').fill(COPY_TITLE);
  // Another day, so the form does not warn that the class already has an exam on the date.
  const tomorrow = Date.now() + 24 * 60 * 60_000;
  await page.locator('input[name="date"]').fill(localDate(tomorrow));
  await page.locator('input[name="opensAt"]').fill(localInput(tomorrow));
  await page.locator('input[name="closesAt"]').fill(localInput(tomorrow + 120 * 60_000));
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await poll(() => examByTitle(COPY_TITLE), (e) => e !== null, 60_000);
  state.copyId = (await examByTitle(COPY_TITLE))!.id;
  await poll(() => packDoc(state.copyId, 1), (p) => p !== null, 60_000);
  await poll(() => examByTitle(COPY_TITLE), (e) => e?.data.imagePacks === 1, 60_000);

  const original = (await packDoc(state.examId, 1))!;
  const copy = (await packDoc(state.copyId, 1))!;
  expect(copy.images, 'the same picture under the same id').toEqual(original.images);
  const questions = (await subDoc(state.copyId, 'content', 'questions'))!.items as { image?: Record<string, unknown> }[];
  expect(questions[0].image).toMatchObject({ pack: 1, alt: ALT });
});

test('the administrator finalizes and deletes both exams, and the packs go with them', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await page.getByRole('button', { name: 'Close early' }).click();
  await confirm(page, /^Yes, close early$/);
  await poll(statusOf, (s) => s === 'closed');
  await page.goto(`/dashboard/list/exams/${state.examId}/results`);
  await poll(() => subDoc(state.examId, 'grades', state.studentUid), (g) => g !== null, 60_000);

  const admin = await context.browser()!.newContext();
  await forceLiveData(admin);
  const view = await admin.newPage();
  try {
    await loginAs(view, 'admin');
    await view.goto(`/dashboard/list/exams/${state.examId}/results`);
    await view.getByRole('button', { name: 'Finalize exam' }).click();
    await view.getByRole('dialog').getByRole('button', { name: 'Finalize exam' }).click();
    await poll(statusOf, (s) => s === 'finalized', 60_000);

    await deleteFromList(view, COPY_TITLE);
    expect(await packDoc(state.copyId, 1), 'the copy’s pack is deleted with it').toBeNull();
    expect(await subCount(state.copyId, 'content'), 'nothing is left under content').toBe(0);

    await deleteFromList(view, TITLE);
    expect(await packDoc(state.examId, 1), 'the original’s pack is deleted with it').toBeNull();
    expect(await subCount(state.examId, 'content')).toBe(0);
  } finally {
    await admin.close();
  }
});
