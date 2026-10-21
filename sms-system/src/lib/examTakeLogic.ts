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

export type NavigatorItem = { id: string; number: number; answered: boolean; flagged: boolean };

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
