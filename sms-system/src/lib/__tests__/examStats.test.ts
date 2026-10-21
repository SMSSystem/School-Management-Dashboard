import { describe, expect, it } from 'vitest';
import { classStats, difficultyPercent, mergeQuestionStats, questionStatsFrom } from '../examStats';
import type { ExamQuestion } from '@/types/exams';

// The numbers on the staff results screen (EXAMS_FEATURE_SPEC.md §6.6).

describe('classStats', () => {
  it('gives the count, average to two decimals, lowest and highest', () => {
    expect(classStats([10, 7, 8.5])).toEqual({ count: 3, average: 8.5, min: 7, max: 10 });
    expect(classStats([1, 2, 2])).toEqual({ count: 3, average: 1.67, min: 1, max: 2 });
  });

  it('has null figures for no scores, and ignores values that are not numbers', () => {
    expect(classStats([])).toEqual({ count: 0, average: null, min: null, max: null });
    expect(classStats([Number.NaN, 4])).toEqual({ count: 1, average: 4, min: 4, max: 4 });
  });
});

describe('questionStatsFrom', () => {
  const opts = (...ids: string[]) => ids.map((id) => ({ id, text: id }));
  const questions: ExamQuestion[] = [
    { id: 'q1', text: 'one', kind: 'single', options: opts('a', 'b'), points: 1 },
    { id: 'q2', text: 'two', kind: 'multiple', options: opts('a', 'b', 'c'), points: 2 },
  ];
  const key = { q1: ['a'], q2: ['a', 'b'] };

  it('counts who answered and who got it exactly right, per question', () => {
    const attempts: { answers?: Record<string, string[]> }[] = [
      { answers: { q1: ['a'], q2: ['a', 'b'] } },
      { answers: { q1: ['b'], q2: ['a'] } },
      { answers: { q1: ['a'] } },
      { answers: {} },
      {},
    ];
    expect(questionStatsFrom(attempts, questions, key)).toEqual({
      q1: { answered: 3, correct: 2 },
      q2: { answered: 2, correct: 1 },
    });
  });

  it('starts every question at zero, even with no attempts', () => {
    expect(questionStatsFrom([], questions, key)).toEqual({ q1: { answered: 0, correct: 0 }, q2: { answered: 0, correct: 0 } });
  });
});

describe('difficultyPercent', () => {
  it('is the percentage of those who answered that got it right', () => {
    expect(difficultyPercent({ answered: 4, correct: 3 })).toBe(75);
    expect(difficultyPercent({ answered: 3, correct: 1 })).toBe(33);
    expect(difficultyPercent({ answered: 5, correct: 0 })).toBe(0);
  });

  it('is null when nobody answered or the question is unknown', () => {
    expect(difficultyPercent({ answered: 0, correct: 0 })).toBeNull();
    expect(difficultyPercent(undefined)).toBeNull();
  });
});

describe('mergeQuestionStats', () => {
  it('adds the counts and keeps questions found in only one set', () => {
    expect(
      mergeQuestionStats({ q1: { answered: 2, correct: 1 } }, { q1: { answered: 3, correct: 3 }, q2: { answered: 1, correct: 0 } }),
    ).toEqual({ q1: { answered: 5, correct: 4 }, q2: { answered: 1, correct: 0 } });
    expect(mergeQuestionStats({}, {})).toEqual({});
  });
});
