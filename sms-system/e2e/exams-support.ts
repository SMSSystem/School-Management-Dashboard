import { inflateSync } from 'node:zlib';
import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { db, institutionId, userByEmail } from './lesson-notes-support';
import { CLASS_A_NAME, SUBJECT_NAME, loginAs } from './lesson-notes-ui-support';

// Support code for e2e/19-exams.spec.ts (the online exams, docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md). It builds
// on the fixtures of spec 09: the QaLessons teacher who teaches QA Lessons Subject in QA Assignments Class, and the
// fixture student and parent of spec 08. Ground truth is read through the Admin SDK, as in the other specs.

export { CLASS_A_NAME, SUBJECT_NAME, loginAs };
export { db, institutionId, userByEmail };

/** Every exam this spec creates starts with this, so a run that stopped half way can be swept. */
export const EXAM_PREFIX = 'QA Online Exam';
export const EXAM_MINUTES = 10;

/** The template's columns with three questions: two single-answer, one with two right answers. Four points in all. */
export const QUESTIONS_CSV = [
  'Question,Type,Option A,Option B,Option C,Option D,Correct,Points',
  '"Which planet is closest to the sun?",single,Venus,Mercury,Earth,Mars,B,1',
  '"Which of these are prime numbers?",multiple,2,4,5,9,"A,C",2',
  '"What is 3 + 4?",single,6,7,8,9,B,1',
].join('\n');

/** What the student in the spec answers: Mercury (right), 2 and 5 (right), 6 (wrong). Three of four points. */
export const EXPECTED_SCORE = { score: 3, maxScore: 4 };

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as YYYY-MM-DD in the machine's time zone, the one the window times use (not UTC, which differs near midnight). */
export function localDate(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Milliseconds as the value of a datetime-local input (the machine's time zone, as the browser reads it). */
export function localInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Makes the page's own clock run ahead of the real one, for the whole context: `new Date()` and `Date.now()` both
 * answer the shifted time, timers stay real. The exam screens must still count down from the server's clock.
 */
export async function skewDeviceClock(context: BrowserContext, minutes: number): Promise<void> {
  await context.addInitScript((offsetMs: number) => {
    const RealDate = Date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    class ShiftedDate extends (RealDate as any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(...args: any[]) {
        if (args.length === 0) super(RealDate.now() + offsetMs);
        else super(...args);
      }
      static now() {
        return RealDate.now() + offsetMs;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Date = ShiftedDate;
  }, minutes * 60_000);
}

// ── Ground truth ────────────────────────────────────────────────────────────

export async function examRef(examId: string) {
  return db().collection('institutions').doc(await institutionId()).collection('exams').doc(examId);
}

export async function examByTitle(title: string): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const iid = await institutionId();
  const snap = await db().collection('institutions').doc(iid).collection('exams').where('title', '==', title).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, data: snap.docs[0].data() };
}

export async function subDoc(examId: string, collection: string, id: string): Promise<Record<string, unknown> | null> {
  const snap = await (await examRef(examId)).collection(collection).doc(id).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

export async function subCount(examId: string, collection: string): Promise<number> {
  return (await (await examRef(examId)).collection(collection).count().get()).data().count;
}

export async function resultEntry(examId: string, studentUid: string): Promise<Record<string, unknown> | null> {
  const iid = await institutionId();
  const snap = await db().collection('institutions').doc(iid).collection('results').doc(`exam_${examId}_${studentUid}`).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

/** Removes every exam this spec made (and the subcollections and results that went with it), for a clean start or end. */
export async function sweepQaExams(): Promise<number> {
  const iid = await institutionId();
  const root = db().collection('institutions').doc(iid);
  const exams = await root.collection('exams').get();
  let removed = 0;
  for (const exam of exams.docs) {
    if (!String(exam.data().title ?? '').startsWith(EXAM_PREFIX)) continue;
    const results = await root.collection('results').where('examId', '==', exam.id).get();
    await Promise.all(results.docs.map((r) => r.ref.delete()));
    await db().recursiveDelete(exam.ref);
    removed += 1;
  }
  return removed;
}

// ── Screens ─────────────────────────────────────────────────────────────────

/** Add exam as an online exam: ten minutes, open from five minutes ago for two hours, scores released once graded. */
export async function createOnlineExam(page: Page, title: string, options: { unsupervised?: boolean; forwardOnly?: boolean } = {}): Promise<void> {
  await page.goto('/dashboard/list/exams');
  await page.getByRole('button', { name: 'Add new exam' }).click();
  await page.locator('select[name="termId"]').selectOption({ label: 'Christmas Term' });
  await page.locator('select[name="subjectId"]').selectOption({ label: SUBJECT_NAME });
  await page.locator('select[name="classId"]').selectOption({ label: CLASS_A_NAME });
  await page.locator('input[name="date"]').fill(localDate());
  await page.locator('input[name="duration"]').fill(String(EXAM_MINUTES));
  await page.locator('input[name="title"]').fill(title);
  await page.locator('select[name="valueType"]').selectOption({ label: 'Quiz' });
  await page.locator('select[name="categoryType"]').selectOption({ label: 'Multiple Choice' });
  await page.locator('select[name="answerMode"]').selectOption({ value: 'both' });
  await page.locator('input[name="online"]').check();
  const now = Date.now();
  await page.locator('input[name="opensAt"]').fill(localInput(now - 5 * 60_000));
  await page.locator('input[name="closesAt"]').fill(localInput(now + 120 * 60_000));
  await page.locator('select[name="releaseMode"]').selectOption({ value: 'auto' });
  await page.locator('input[name="autoGrade"]').check();
  await page.locator('input[name="shuffle"]').uncheck();
  if (options.unsupervised) await page.locator('select#integrity').selectOption({ value: 'unsupervised' });
  if (options.forwardOnly) await page.getByLabel('Forward only').check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
}

/** Opens the import dialog of the builder, reads the CSV and sends it to the builder (unsaved). */
export async function importQuestions(page: Page, csv: string): Promise<void> {
  await page.getByRole('button', { name: 'Import from file' }).click();
  await page.locator('#exam-import-file').setInputFiles({ name: 'questions.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByRole('status').filter({ hasText: '3 questions found' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Review in the builder' }).click();
}

/** The student's answers: Mercury, 2 and 5, and 6; Question 2 is flagged. Leaves the attempt on its last question. */
export async function answerQuestions(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Mercury', exact: true }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('checkbox', { name: '2', exact: true }).check();
  await page.getByRole('checkbox', { name: '5', exact: true }).check();
  await page.getByRole('button', { name: 'Flag for review' }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('radio', { name: '6', exact: true }).check();
}

/** Seconds on the attempt screen's countdown, from text such as 09:41 or 1:09:41. */
export async function timerSeconds(page: Page): Promise<number> {
  const text = (await page.getByRole('timer').first().innerText()).trim();
  const parts = text.split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

// ── Pictures (e2e/21-exam-images.spec.ts) ───────────────────────────────────

/** A picture pack of an exam as stored (ground truth), or null. */
export async function packDoc(examId: string, n: number): Promise<{ images: Record<string, { mime: string; data: string }> } | null> {
  return (await subDoc(examId, 'content', `images_${n}`)) as { images: Record<string, { mime: string; data: string }> } | null;
}

/** The bytes of a data URL. */
export const bytesOfDataUrl = (url: string): Buffer => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

/** The chunk types of a PNG, in order, and its pixel data (the IDAT chunks joined and inflated). */
export function pngParts(png: Uint8Array): { types: string[]; pixels: Buffer } {
  const types: string[] = [];
  const idat: Buffer[] = [];
  const buffer = Buffer.from(png);
  for (let at = 8; at + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('latin1', at + 4, at + 8);
    types.push(type);
    if (type === 'IDAT') idat.push(buffer.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  return { types, pixels: inflateSync(Buffer.concat(idat)) };
}
