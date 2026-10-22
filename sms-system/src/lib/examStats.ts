import type { ExamKeyAnswers, ExamQuestion, ExamQuestionStat } from '@/types/exams';
import { round2, scoreQuestion } from './examScoring';

// The numbers on the staff results screen (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §6.6). Pure and
// Firebase-free.

export type ClassStats = {
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
};

/** Count, average (two decimals), lowest and highest of the scores; null figures when there are none. */
export function classStats(scores: readonly number[]): ClassStats {
  const usable = scores.filter((s) => Number.isFinite(s));
  if (usable.length === 0) return { count: 0, average: null, min: null, max: null };
  const sum = usable.reduce((a, b) => a + b, 0);
  return {
    count: usable.length,
    average: round2(sum / usable.length),
    min: Math.min(...usable),
    max: Math.max(...usable),
  };
}

/**
 * For each question: how many of the given attempts answered it and how many answered it exactly right. Pass only
 * submitted attempts. `correct` means the chosen options equal the key (partial credit does not count as correct).
 */
export function questionStatsFrom(
  attempts: readonly { answers?: Readonly<Record<string, readonly string[]>> }[],
  questions: readonly ExamQuestion[],
  key: ExamKeyAnswers,
): Record<string, ExamQuestionStat> {
  const stats: Record<string, ExamQuestionStat> = {};
  for (const q of questions) stats[q.id] = { answered: 0, correct: 0 };
  for (const attempt of attempts) {
    for (const q of questions) {
      const result = scoreQuestion(q, attempt.answers?.[q.id], key[q.id], 'all_or_nothing');
      if (result.answered) stats[q.id].answered += 1;
      if (result.correct) stats[q.id].correct += 1;
    }
  }
  return stats;
}

/** The share of those who answered the question that got it right, as a whole percentage; null if nobody answered. */
export function difficultyPercent(stat: ExamQuestionStat | undefined): number | null {
  if (!stat || stat.answered <= 0) return null;
  return Math.round((stat.correct / stat.answered) * 100);
}

/** Adds two sets of per-question counts (for example the counts of two batches of attempts). */
export function mergeQuestionStats(
  a: Readonly<Record<string, ExamQuestionStat>>,
  b: Readonly<Record<string, ExamQuestionStat>>,
): Record<string, ExamQuestionStat> {
  const merged: Record<string, ExamQuestionStat> = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    merged[id] = {
      answered: (a[id]?.answered ?? 0) + (b[id]?.answered ?? 0),
      correct: (a[id]?.correct ?? 0) + (b[id]?.correct ?? 0),
    };
  }
  return merged;
}
