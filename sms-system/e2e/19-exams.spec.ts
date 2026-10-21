import { test, expect, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK, expectAllowed, expectDenied, openProbe, userByEmail } from './lesson-notes-support';
import { doc, getDoc } from 'firebase/firestore';
import {
  EXAM_MINUTES,
  EXAM_PREFIX,
  EXPECTED_SCORE,
  QUESTIONS_CSV,
  answerQuestions,
  createOnlineExam,
  examByTitle,
  importQuestions,
  institutionId,
  loginAs,
  resultEntry,
  skewDeviceClock,
  subCount,
  subDoc,
  sweepQaExams,
  timerSeconds,
} from './exams-support';

// Online exams, end to end (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §15 step 8) against the live QA
// institution, with the exam rules DEPLOYED (`npm run firebase:deploy:rules`): the teacher builds and publishes an exam,
// a student sits it with the device clock ten minutes fast, the administrator cannot delete it while the student is
// sitting it, the teacher closes and grades it, the student and the parent see the score, the administrator finalizes and
// deletes it. It uses the fixtures of specs 08 and 09 (QaLessons teacher, the fixture student and parent) and makes one
// exam of its own, swept before and after.
//
// The device-clock case needs the Realtime Database offset, which exists only when the app is built with
// VITE_SINGLE_SESSION_ENABLED=true and VITE_FIREBASE_DATABASE_URL (see spec 13); without it the clock is not skewed and
// the spec says so in its annotations.

test.describe.configure({ mode: 'serial' });

const SKEW_MINUTES = process.env.VITE_SINGLE_SESSION_ENABLED === 'true' && !!process.env.VITE_FIREBASE_DATABASE_URL ? 10 : 0;
const TITLE = `${EXAM_PREFIX} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const state: { examId: string; studentUid: string; startedAtMs: number } = { examId: '', studentUid: '', startedAtMs: 0 };

const studentEmail = process.env.QA_ASSIGNMENTS_STUDENT_EMAIL;

test.beforeAll(async () => {
  test.skip(!HAS_ADMIN_SDK, 'scripts/service-account.json is required (ground-truth reads)');
  test.skip(!studentEmail || !process.env.QA_ADMIN_EMAIL, 'QA_ASSIGNMENTS_STUDENT_* / QA_ADMIN_* missing from .env.qa');
  state.studentUid = (await userByEmail(studentEmail!)).uid;
  await sweepQaExams();
});

test.afterAll(async () => {
  if (HAS_ADMIN_SDK) await sweepQaExams();
});

const poll = <T>(read: () => Promise<T>, check: (v: T) => boolean, timeout = 30_000) =>
  expect.poll(async () => check(await read()), { timeout, intervals: [500, 1000, 2000] }).toBe(true);

const statusOf = async () => (await examByTitle(TITLE))?.data.status;

async function confirm(page: Page, name: RegExp) {
  await page.getByRole('alertdialog', { name: 'Confirm' }).getByRole('button', { name }).click();
}

test('the teacher builds an online exam from a CSV and publishes it', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await createOnlineExam(page, TITLE);
  await poll(() => examByTitle(TITLE), (e) => e !== null);
  state.examId = (await examByTitle(TITLE))!.id;
  expect((await examByTitle(TITLE))!.data).toMatchObject({ online: true, status: 'draft', duration: EXAM_MINUTES, keyRevision: 1 });

  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await importQuestions(page, QUESTIONS_CSV);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await poll(() => subDoc(state.examId, 'content', 'questions'), (q) => Array.isArray(q?.items) && (q!.items as unknown[]).length === 3);
  await poll(() => subDoc(state.examId, 'private', 'key'), (k) => k !== null);
  expect((await examByTitle(TITLE))!.data).toMatchObject({ questionCount: 3, totalPoints: 4 });

  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await confirm(page, /^Yes, publish$/);
  await poll(statusOf, (s) => s === 'published');
});

test('students and parents cannot reach the staff pages, the key, or the questions they may not read', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'studentA');
  for (const path of ['build', 'preview', 'results']) {
    await page.goto(`/dashboard/list/exams/${state.examId}/${path}`);
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  const iid = await institutionId();
  const student = await openProbe(process.env.QA_ASSIGNMENTS_STUDENT_EMAIL!, process.env.QA_ASSIGNMENTS_STUDENT_PASSWORD!);
  const parent = await openProbe(process.env.QA_ASSIGNMENTS_PARENT_EMAIL!, process.env.QA_ASSIGNMENTS_PARENT_PASSWORD!);
  try {
    const at = (p: string) => `institutions/${iid}/exams/${state.examId}/${p}`;
    await expectAllowed('the student reads the questions inside the window', getDoc(doc(student.db, at('content/questions'))));
    await expectDenied('the student reads the answer key', getDoc(doc(student.db, at('private/key'))));
    await expectDenied('a parent reads the questions', getDoc(doc(parent.db, at('content/questions'))));
    await expectDenied('a parent reads the answer key', getDoc(doc(parent.db, at('private/key'))));
  } finally {
    await student.close();
    await parent.close();
  }
});

test('a student sits the exam on a fast device clock, and the administrator cannot delete it meanwhile', async ({ page, context, browser }) => {
  if (SKEW_MINUTES === 0) {
    test.info().annotations.push({ type: 'note', description: 'No Realtime Database offset in this run: the device clock was NOT skewed. Set VITE_SINGLE_SESSION_ENABLED=true and VITE_FIREBASE_DATABASE_URL.' });
  }
  await forceLiveData(context);
  await skewDeviceClock(context, SKEW_MINUTES);
  await loginAs(page, 'studentA');
  await page.goto('/dashboard/list/exams');
  await page.getByRole('link', { name: `Start ${TITLE}` }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();

  // The countdown follows the server: about ten minutes, however fast the device clock is.
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 30_000 });
  const seconds = await timerSeconds(page);
  expect(seconds, 'the countdown starts from the exam duration').toBeGreaterThan(EXAM_MINUTES * 60 - 40);
  expect(seconds).toBeLessThanOrEqual(EXAM_MINUTES * 60);

  await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a !== null);
  const attempt = (await subDoc(state.examId, 'attempts', state.studentUid))!;
  const startedAt = (attempt.startedAt as { toMillis(): number }).toMillis();
  const deadlineAt = (attempt.deadlineAt as { toMillis(): number }).toMillis();
  state.startedAtMs = startedAt;
  expect(Math.abs(startedAt - Date.now()), 'the start is the server time, not the skewed device time').toBeLessThan(60_000);
  expect(deadlineAt - startedAt, 'the deadline is one duration after the start').toBeGreaterThan((EXAM_MINUTES * 60 - 10) * 1000);
  expect(deadlineAt - startedAt).toBeLessThanOrEqual(EXAM_MINUTES * 60 * 1000);
  expect(attempt).toMatchObject({ status: 'in_progress', tabSwitches: 0 });

  await answerQuestions(page);

  await test.step('the administrator is refused while the student is sitting', async () => {
    const adminContext = await browser.newContext();
    await forceLiveData(adminContext);
    const admin = await adminContext.newPage();
    try {
      await loginAs(admin, 'admin');
      await admin.goto('/dashboard/list/exams');
      await admin.locator('tr', { hasText: TITLE }).getByRole('button', { name: 'Delete exam' }).click();
      await expect(admin.getByRole('alert').filter({ hasText: /still sitting this exam/ })).toBeVisible({ timeout: 30_000 });
      await expect(admin.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
    } finally {
      await adminContext.close();
    }
  });

  await page.getByRole('button', { name: 'Submit exam' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit exam' }).click();
  await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a?.status === 'submitted');
  const submitted = (await subDoc(state.examId, 'attempts', state.studentUid))!;
  expect(submitted).toMatchObject({ status: 'submitted', submitReason: 'student' });
  expect(Object.keys(submitted.answers as object)).toHaveLength(3);
  expect(submitted.flags).toHaveLength(1);
});

test('the teacher closes the exam, it is graded and released, and the student and the parent see the score', async ({ page, context, browser }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await page.getByRole('button', { name: 'Close early' }).click();
  await confirm(page, /^Yes, close early$/);
  await poll(statusOf, (s) => s === 'closed');

  await page.goto(`/dashboard/list/exams/${state.examId}/results`);
  await poll(() => subDoc(state.examId, 'grades', state.studentUid), (g) => g !== null, 60_000);
  const grade = (await subDoc(state.examId, 'grades', state.studentUid))!;
  expect(grade).toMatchObject({ ...EXPECTED_SCORE, method: 'auto', resultSynced: true });
  expect(await resultEntry(state.examId, state.studentUid), 'the score is copied into the results').toMatchObject({ score: EXPECTED_SCORE.score });

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/i);

  for (const who of ['studentA', 'parent'] as const) {
    const other = await browser.newContext();
    await forceLiveData(other);
    const view = await other.newPage();
    try {
      await loginAs(view, who);
      await view.goto('/dashboard/list/exams');
      await expect(view.locator('tr', { hasText: TITLE }).first()).toContainText(`${EXPECTED_SCORE.score} / ${EXPECTED_SCORE.maxScore}`, { timeout: 30_000 });
    } finally {
      await other.close();
    }
  }
});

test('the administrator finalizes the exam and then deletes it with everything under it', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'admin');
  await page.goto(`/dashboard/list/exams/${state.examId}/results`);
  await page.getByRole('button', { name: 'Finalize exam' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalize exam' }).click();
  await poll(statusOf, (s) => s === 'finalized', 60_000);
  expect(await subCount(state.examId, 'attempts'), 'the attempts are removed at Finalize').toBe(0);
  expect(await subCount(state.examId, 'grades'), 'the grades are kept').toBe(1);

  await page.goto('/dashboard/list/exams');
  await page.locator('tr', { hasText: TITLE }).getByRole('button', { name: 'Delete exam' }).click();
  await expect(page.getByText(/Its questions and answer key go with it/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await poll(() => examByTitle(TITLE), (e) => e === null, 60_000);

  for (const [collection, id] of [['content', 'questions'], ['private', 'key'], ['grades', state.studentUid]] as const) {
    expect(await subDoc(state.examId, collection, id), `${collection}/${id} is deleted with the exam`).toBeNull();
  }
  expect(await subCount(state.examId, 'grades')).toBe(0);
  expect(await resultEntry(state.examId, state.studentUid), 'the results entry stays: it is the academic record').not.toBeNull();
});
