import { isPastDeadline } from './examTiming';

// The pure half of deleting an online exam (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §6.9): what hangs off an
// exam, who is still sitting it, what the confirmation says and what stops the deletion. No Firebase import, so it is
// unit-tested directly; examDelete.ts does the reads and writes.

/** The subcollections of an exam document. Firestore does not cascade, so each is removed before the exam itself. */
export const EXAM_SUBCOLLECTIONS = ['content', 'private', 'attempts', 'grades', 'accommodations'] as const;

/** The two documents that always have a fixed id; the other three subcollections hold one document per student. */
export const EXAM_FIXED_DOCUMENTS = [
  { collection: 'content', id: 'questions' },
  { collection: 'private', id: 'key' },
] as const;

/** What the confirmation counts (and what goes with the exam). `imagePacks` are the documents that hold the questions' pictures. */
export type ExamDeleteCounts = { attempts: number; grades: number; accommodations: number; imagePacks?: number };

/** An attempt as the check needs it: the stored status and deadline (milliseconds). */
export type SittingAttempt = { status: string; deadlineAtMs?: number };

/**
 * The attempts still under way: in progress and not yet past the deadline plus the grace the rules allow for a last
 * save. An in-progress attempt past that point was abandoned (staff mark it expired when they grade), so it does not
 * keep the exam from being deleted. A missing deadline counts as under way, the safe side.
 */
export function sittingNow(attempts: readonly SittingAttempt[], nowMs: number): number {
  return attempts.filter((a) => a.status === 'in_progress' && (a.deadlineAtMs === undefined || !isPastDeadline(nowMs, a.deadlineAtMs))).length;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Why Delete is refused, or null. Only students still sitting the exam stop it. */
export function examDeleteBlockReason(sitting: number): string | null {
  if (sitting <= 0) return null;
  return `${plural(sitting, 'student is', 'students are')} still sitting this exam. Deleting it now would end their attempt without a save. Wait until their time is up (or until they submit), then delete it.`;
}

/** The records that go with the exam, as a list for the dialog; empty when there is nothing besides the exam. */
export function examDeleteSummary(c: ExamDeleteCounts): string[] {
  const parts: string[] = [];
  if (c.attempts > 0) parts.push(plural(c.attempts, 'attempt'));
  if (c.grades > 0) parts.push(plural(c.grades, 'score'));
  if (c.accommodations > 0) parts.push(plural(c.accommodations, 'extra-time entry', 'extra-time entries'));
  if ((c.imagePacks ?? 0) > 0) parts.push(plural(c.imagePacks ?? 0, 'picture pack'));
  return parts;
}

/** The dialog's sentence about what goes with the exam, and what stays. */
export function examDeleteWarning(c: ExamDeleteCounts): string {
  const parts = examDeleteSummary(c);
  const along = parts.length > 0 ? `, along with ${parts.join(', ')}` : '';
  const what = (c.imagePacks ?? 0) > 0 ? 'questions, pictures and answer key' : 'questions and answer key';
  return `Its ${what} go with it${along}. Scores already copied to students' results stay.`;
}
