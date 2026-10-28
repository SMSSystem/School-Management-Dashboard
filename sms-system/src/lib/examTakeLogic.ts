import type { ExamOrder, ExamQuestion } from '@/types/exams';
import { defaultRng, makeAttemptOrder, orderQuestions, type Rng } from './examShuffle';

// What a student's question screen needs, shared by the staff preview and the attempt screen
// (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.5). Pure and Firebase-free.

type Answers = Readonly<Record<string, readonly string[]>>;

/** Has the student chosen at least one of the question's options? (Unknown option ids do not count.) */
export function isAnswered(question: ExamQuestion, answers: Answers): boolean {
  const chosen = answers[question.id] ?? [];
  return question.options.some((o) => chosen.includes(o.id));
}

/** How many of the questions are answered. */
export function answeredCount(questions: readonly ExamQuestion[], answers: Answers): number {
  return questions.filter((q) => isAnswered(q, answers)).length;
}

/** How many of the questions still have no answer (the same count "Answered N of M" and the navigator use). */
export function unansweredCount(questions: readonly ExamQuestion[], answers: Answers): number {
  return questions.length - answeredCount(questions, answers);
}

/** Submit is available once every question is answered. A flag does not count as an answer. */
export function canSubmit(questions: readonly ExamQuestion[], answers: Answers): boolean {
  return unansweredCount(questions, answers) === 0;
}

/** What to say beside a Submit button that is off: empty when nothing is left. */
export function submitHint(unanswered: number): string {
  return unanswered > 0 ? `Answer all questions to submit (${unanswered} left)` : '';
}

export type NavigatorItem ={ id: string; number: number; answered: boolean; flagged: boolean };

/** The navigator's buttons, in the order the student sees the questions. */
export function navigatorState(
  questions: readonly ExamQuestion[],
  answers: Answers,
  flags: readonly string[],
): NavigatorItem[] {
  return questions.map((q, index) => ({
    id: q.id,
    number: index + 1,
    answered: isAnswered(q, answers),
    flagged: flags.includes(q.id),
  }));
}

/**
 * The chosen options after the student clicks one. A single question holds one option (clicking another replaces
 * it); a multiple question toggles. An option the question does not have changes nothing.
 */
export function toggleAnswer(question: ExamQuestion, chosen: readonly string[] | undefined, optionId: string): string[] {
  const current = chosen ?? [];
  if (!question.options.some((o) => o.id === optionId)) return [...current];
  if (question.kind === 'single') return [optionId];
  return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
}

/** Flags a question, or removes its flag. */
export function toggleFlag(flags: readonly string[], questionId: string): string[] {
  return flags.includes(questionId) ? flags.filter((id) => id !== questionId) : [...flags, questionId];
}

/** The questions in a student's order: shuffled when the exam shuffles (a preview makes a fresh order each time). */
export function previewQuestions(
  questions: readonly ExamQuestion[],
  shuffle: boolean,
  rng: Rng = defaultRng(),
): { questions: ExamQuestion[]; order: ExamOrder } {
  const order = makeAttemptOrder(questions, shuffle, rng);
  return { questions: orderQuestions(questions, order), order };
}

// ── Forward only (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.2) ───────────────────────────────────────────────────────────

/** Is the exam sat in order only? The tick counts only with Unsupervised (the form and the rules say the same). */
export function isForwardOnly(exam: { forwardOnly?: boolean; integrity?: string }): boolean {
  return exam.forwardOnly === true && exam.integrity === 'unsupervised';
}

/**
 * May the student move from question `current` to `target` (indexes)? Anywhere inside the exam when it is free; in a
 * forward-only exam only to the next question (or staying where they are), and to the next one only once the question
 * they are on is answered (`currentAnswered`, from `canAdvance`; a caller that does not pass it asks nothing of the answer).
 */
export function canGoTo(current: number, target: number, forwardOnly: boolean, total: number, currentAnswered = true): boolean {
  if (!Number.isInteger(target) || target < 0 || target >= total) return false;
  if (!forwardOnly) return true;
  return target === current || (target === current + 1 && currentAnswered);
}

/** Shown beside Next while a forward-only exam waits for an answer to the current question. */
export const ADVANCE_HINT = 'Choose an answer to continue';

/** May the student leave this question for the next? Always in a free exam; in a forward-only exam once it is answered. */
export function canAdvance(question: ExamQuestion | undefined, answers: Answers, forwardOnly: boolean): boolean {
  return !forwardOnly || (question !== undefined && isAnswered(question, answers));
}

/**
 * Where a forward-only attempt reopens after a reload. The browser keeps no position, so it is the question after the last
 * one the student has answered (they had left that one, so it is not opened again), or the last question when that is the
 * one answered; the first question when none is. A free exam always reopens on the first question as before.
 */
export function resumeIndex(questions: readonly ExamQuestion[], answers: Answers, forwardOnly: boolean): number {
  if (!forwardOnly) return 0;
  let last = -1;
  questions.forEach((q, i) => {
    if (isAnswered(q, answers)) last = i;
  });
  return Math.min(last + 1, Math.max(questions.length - 1, 0));
}

/** What a numbered button is in a forward-only exam, from the question the student is on. */
export function forwardState(index: number, currentIndex: number): 'current' | 'left' | 'ahead' {
  return index === currentIndex ? 'current' : index < currentIndex ? 'left' : 'ahead';
}
