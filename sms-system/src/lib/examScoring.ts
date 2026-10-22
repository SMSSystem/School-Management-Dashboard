import type { ExamKeyAnswers, ExamQuestion, ExamScoringMode } from '@/types/exams';

// Scores an online multiple-choice exam (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §6.2). Pure and
// Firebase-free: the staff browser that grades an exam calls scoreAttempt() for each submitted attempt with the
// questions, the key and the exam's scoring mode. Each question is computed exactly; only the total is rounded.

/** Rounds to two decimals (the precision a score is stored and shown at). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type QuestionScore = {
  questionId: string;
  // Points earned, unrounded.
  earned: number;
  // True only when the chosen options are exactly the correct ones.
  correct: boolean;
  // True when at least one valid option was chosen.
  answered: boolean;
};

/**
 * One question's score.
 *
 * - Option ids that are not in the question are ignored (rules cannot check what is inside `answers`).
 * - A single question scores its points for exactly the correct option; choosing more than one option scores 0.
 * - A multiple question scores its points for exactly the correct set (all-or-nothing); with partial credit it
 *   scores points × max(0, (R − W) / C), where R is the correct options chosen, W the wrong options chosen and
 *   C the number of correct options.
 * - An unanswered question, or one with no usable key, scores 0.
 */
export function scoreQuestion(
  question: ExamQuestion,
  chosen: readonly string[] | undefined,
  correctIds: readonly string[] | undefined,
  scoringMode: ExamScoringMode,
): QuestionScore {
  const valid = new Set(question.options.map((o) => o.id));
  const picked = new Set((chosen ?? []).filter((id) => valid.has(id)));
  const correct = new Set((correctIds ?? []).filter((id) => valid.has(id)));
  const answered = picked.size > 0;
  const result = (earned: number, exact: boolean): QuestionScore => ({
    questionId: question.id,
    earned,
    correct: exact,
    answered,
  });
  if (correct.size === 0 || !answered) return result(0, false);

  let right = 0;
  let wrong = 0;
  for (const id of picked) {
    if (correct.has(id)) right += 1;
    else wrong += 1;
  }
  const exact = wrong === 0 && right === correct.size;

  if (question.kind === 'single') return result(exact ? question.points : 0, exact);
  if (scoringMode === 'all_or_nothing') return result(exact ? question.points : 0, exact);
  return result(question.points * Math.max(0, (right - wrong) / correct.size), exact);
}

export type AttemptScore = {
  score: number;
  maxScore: number;
  perQuestion: QuestionScore[];
};

/** A whole attempt: every question scored, the total and the maximum rounded once to two decimals. */
export function scoreAttempt(input: {
  questions: readonly ExamQuestion[];
  answers: Readonly<Record<string, readonly string[]>> | undefined;
  key: ExamKeyAnswers;
  scoringMode: ExamScoringMode;
}): AttemptScore {
  const perQuestion = input.questions.map((q) =>
    scoreQuestion(q, input.answers?.[q.id], input.key[q.id], input.scoringMode),
  );
  const score = perQuestion.reduce((sum, q) => sum + q.earned, 0);
  const maxScore = input.questions.reduce((sum, q) => sum + q.points, 0);
  return { score: round2(score), maxScore: round2(maxScore), perQuestion };
}
