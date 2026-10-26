import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { forceLiveData } from './helpers';
import { HAS_ADMIN_SDK, userByEmail } from './lesson-notes-support';
import {
  EXAM_PREFIX,
  QUESTIONS_CSV,
  answerQuestions,
  createOnlineExam,
  examByTitle,
  importQuestions,
  loginAs,
  subCount,
  subDoc,
  sweepQaExams,
} from './exams-support';

// The activity log of an exam attempt, end to end (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9) against
// the live QA institution, with the rules that accept `events` on an attempt and `integrity` on a grade DEPLOYED
// (`npm run firebase:deploy:rules`): a student sits an exam and leaves its page twice and copies and opens a menu, the
// saved attempt holds the log, the teacher's results screen shows the leaves and a timeline, the CSV has the new columns,
// the administrator finalizes, and the grade keeps the report after the attempt is gone.
//
// Playwright keeps every page visible and focused, so this SIMULATES the browser: it overrides `document.visibilityState`
// and `document.hasFocus` and fires `visibilitychange`, `blur`, `focus`, `copy` and `contextmenu`. What a real browser
// does with a second tab, a minimised window, Alt-Tab, developer tools or a phone is a manual check, not covered here.

test.describe.configure({ mode: 'serial' });

// The title must not hold a word the "nothing about it" check looks for on the student's and parent's page.
const TITLE = `${EXAM_PREFIX} sitting log ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ${Math.random().toString(36).slice(2, 6)}`;
const state: { examId: string; studentUid: string } = { examId: '', studentUid: '' };
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

/** What the page reports to the app: in sight or not, focused or not. Then the three events a browser fires. */
async function simulate(page: Page, view: { visible: boolean; focused: boolean }) {
  await page.evaluate(({ visible, focused }) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
    document.hasFocus = () => focused;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event(focused ? 'focus' : 'blur'));
  }, view);
}

const act = (page: Page, name: 'copy' | 'contextmenu') => page.evaluate((n) => window.dispatchEvent(new Event(n)), name);

type Entry = { t: number; k: string; d?: number };

test('the teacher builds an online exam and publishes it', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await createOnlineExam(page, TITLE);
  await poll(() => examByTitle(TITLE), (e) => e !== null);
  state.examId = (await examByTitle(TITLE))!.id;
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await importQuestions(page, QUESTIONS_CSV);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await poll(() => subDoc(state.examId, 'content', 'questions'), (q) => Array.isArray(q?.items) && (q!.items as unknown[]).length === 3);
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await confirm(page, /^Yes, publish$/);
  await poll(statusOf, (s) => s === 'published');
});

test('a student is told what is recorded, leaves the page twice, copies and submits, and the log is saved', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'studentA');
  await page.goto('/dashboard/list/exams');
  await page.getByRole('link', { name: `Start ${TITLE}` }).click();
  await expect(page.getByRole('note').filter({ hasText: 'This exam records when you leave this page' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page.getByRole('timer').first()).toBeVisible({ timeout: 30_000 });
  await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a !== null);

  await answerQuestions(page);

  await test.step('leave 1: the page goes out of sight for a few seconds', async () => {
    await simulate(page, { visible: false, focused: false });
    await page.waitForTimeout(3500);
    await simulate(page, { visible: true, focused: true });
  });
  await test.step('leave 2: the window only loses focus for a few seconds', async () => {
    await page.waitForTimeout(500);
    await simulate(page, { visible: true, focused: false });
    await page.waitForTimeout(2500);
    await simulate(page, { visible: true, focused: true });
  });
  await test.step('a copy and a context menu are recorded, and nothing is blocked', async () => {
    await page.waitForTimeout(500);
    await act(page, 'copy');
    await act(page, 'contextmenu');
    await expect(page.getByRole('timer').first()).toBeVisible();
  });

  await page.getByRole('button', { name: 'Submit exam' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit exam' }).click();
  await poll(() => subDoc(state.examId, 'attempts', state.studentUid), (a) => a?.status === 'submitted');

  const attempt = (await subDoc(state.examId, 'attempts', state.studentUid))!;
  expect(attempt.tabSwitches).toBe(2);
  const events = (attempt.events as Entry[]).map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
  expect(events.map((e) => e.k)).toEqual(['hidden', 'blur', 'copy', 'menu']);
  const [hidden, blur] = events;
  expect(hidden.d ?? 0, 'the page was out of sight for about 3.5 seconds').toBeGreaterThanOrEqual(3);
  expect(hidden.d ?? 0).toBeLessThanOrEqual(8);
  expect(blur.d ?? 0, 'the window was unfocused for about 2.5 seconds').toBeGreaterThanOrEqual(2);
  expect(blur.d ?? 0).toBeLessThanOrEqual(7);
  for (const e of events) expect(e.t, 'seconds since the attempt started').toBeLessThan(600);
  const answeredAt = attempt.answeredAt as Record<string, number>;
  expect(Object.keys(answeredAt), 'when each of the three answers was given').toHaveLength(3);
  for (const t of Object.values(answeredAt)) expect(t).toBeGreaterThanOrEqual(0);
});

test('the teacher sees the leaves, the timeline and the CSV, and the grade carries the summary', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'teacher');
  await page.goto(`/dashboard/list/exams/${state.examId}/build`);
  await page.getByRole('button', { name: 'Close early' }).click();
  await confirm(page, /^Yes, close early$/);
  await poll(statusOf, (s) => s === 'closed');

  await page.goto(`/dashboard/list/exams/${state.examId}/results`);
  await poll(() => subDoc(state.examId, 'grades', state.studentUid), (g) => g !== null, 60_000);
  const grade = (await subDoc(state.examId, 'grades', state.studentUid))!;
  const summary = grade.integrity as { leaves: number; hiddenLeaves: number; acts: number; timeline: Entry[] };
  expect(summary).toMatchObject({ leaves: 2, hiddenLeaves: 1, acts: 2 });
  expect(summary.timeline).toHaveLength(4);

  await expect(page.getByText(/2 leaves, \d+ seconds away/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /left the exam page/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Left the page (another tab, window or app)');
  await expect(dialog).toContainText('Window lost focus');
  await expect(dialog).toContainText('Copy');
  await expect(dialog).toContainText('Context menu');
  await expect(dialog).toContainText('not proof');
  await expect(dialog).toContainText('cannot tell a new tab from a switched tab');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  const csv = readFileSync((await download.path())!, 'utf8').split('\n');
  for (const column of ['Tab switches', 'Time away (seconds)', 'Longest time away (seconds)', 'Review']) expect(csv[0]).toContain(`"${column}"`);
});

test('a student and a parent see their score and nothing about the activity log', async ({ browser }) => {
  for (const who of ['studentA', 'parent'] as const) {
    const context = await browser.newContext();
    await forceLiveData(context);
    const view = await context.newPage();
    try {
      await loginAs(view, who);
      await view.goto('/dashboard/list/exams');
      await expect(view.locator('tr', { hasText: TITLE }).first()).toContainText('/', { timeout: 30_000 });
      await expect(view.getByText(/Timeline|Integrity|left the exam page|leaves/i)).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});

test('the administrator finalizes the exam and the grade keeps the report after the attempt is gone', async ({ page, context }) => {
  await forceLiveData(context);
  await loginAs(page, 'admin');
  await page.goto(`/dashboard/list/exams/${state.examId}/results`);
  await page.getByRole('button', { name: 'Finalize exam' }).click();
  await expect(page.getByRole('dialog')).toContainText('activity summary');
  await page.getByRole('dialog').getByRole('button', { name: 'Finalize exam' }).click();
  await poll(statusOf, (s) => s === 'finalized', 60_000);
  expect(await subCount(state.examId, 'attempts'), 'the attempts are removed at Finalize').toBe(0);

  const grade = (await subDoc(state.examId, 'grades', state.studentUid))!;
  expect(grade.integrity, 'the grade keeps the summary and the timeline').toMatchObject({ leaves: 2, hiddenLeaves: 1, acts: 2 });

  await page.reload();
  await expect(page.getByText(/2 leaves, \d+ seconds away/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /left the exam page/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Left the page (another tab, window or app)');
});
