import { describe, expect, it } from 'vitest';
import { round2, scoreAttempt, scoreQuestion } from '../examScoring';
import type { ExamQuestion } from '@/types/exams';

// Scoring of an online multiple-choice exam (EXAMS_FEATURE_SPEC.md §6.2).

const opts = (...ids: string[]) => ids.map((id) => ({ id, text: `Option ${id}` }));
const single = (id: string, points = 1): ExamQuestion => ({ id, text: `Question ${id}`, kind: 'single', options: opts('a', 'b', 'c', 'd'), points });
const multiple = (id: string, points = 2): ExamQuestion => ({ id, text: `Question ${id}`, kind: 'multiple', options: opts('a', 'b', 'c', 'd'), points });

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(2 / 3)).toBe(0.67);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(3)).toBe(3);
  });
});

describe('a single-answer question', () => {
  const q = single('q1', 2);

  it('scores its points for the correct option only', () => {
    expect(scoreQuestion(q, ['b'], ['b'], 'partial')).toMatchObject({ earned: 2, correct: true, answered: true });
    expect(scoreQuestion(q, ['a'], ['b'], 'partial')).toMatchObject({ earned: 0, correct: false, answered: true });
  });

  it('scores 0 when more than one option is chosen, even with the right one among them', () => {
    expect(scoreQuestion(q, ['a', 'b'], ['b'], 'partial')).toMatchObject({ earned: 0, correct: false });
  });

  it('scores 0 and is unanswered when nothing is chosen', () => {
    expect(scoreQuestion(q, [], ['b'], 'partial')).toMatchObject({ earned: 0, correct: false, answered: false });
    expect(scoreQuestion(q, undefined, ['b'], 'partial')).toMatchObject({ earned: 0, answered: false });
  });

  it('is the same under both scoring modes', () => {
    expect(scoreQuestion(q, ['b'], ['b'], 'all_or_nothing').earned).toBe(2);
    expect(scoreQuestion(q, ['a'], ['b'], 'all_or_nothing').earned).toBe(0);
  });
});

describe('a multiple-answer question, all or nothing', () => {
  const q = multiple('q1', 4);

  it('scores full points only for exactly the correct set, in any order', () => {
    expect(scoreQuestion(q, ['c', 'a'], ['a', 'c'], 'all_or_nothing')).toMatchObject({ earned: 4, correct: true });
  });

  it('scores 0 for a missing option, an extra option, or a different set', () => {
    expect(scoreQuestion(q, ['a'], ['a', 'c'], 'all_or_nothing').earned).toBe(0);
    expect(scoreQuestion(q, ['a', 'b', 'c'], ['a', 'c'], 'all_or_nothing').earned).toBe(0);
    expect(scoreQuestion(q, ['b', 'd'], ['a', 'c'], 'all_or_nothing').earned).toBe(0);
  });
});

describe('a multiple-answer question, partial credit', () => {
  const q = multiple('q1', 4);
  const correct = ['a', 'b', 'c', 'd'].slice(0, 3); // a, b, c

  it('scores points × (right − wrong) / correct, never below 0', () => {
    expect(scoreQuestion(q, ['a'], correct, 'partial').earned).toBeCloseTo((4 * 1) / 3, 10);
    expect(scoreQuestion(q, ['a', 'b'], correct, 'partial').earned).toBeCloseTo((4 * 2) / 3, 10);
    expect(scoreQuestion(q, ['a', 'b', 'c'], correct, 'partial').earned).toBe(4);
    // One right, one wrong: (1 − 1) / 3 = 0.
    expect(scoreQuestion(q, ['a', 'd'], correct, 'partial').earned).toBe(0);
    // One right, two wrong would be negative: held at 0.
    expect(scoreQuestion(q, ['a', 'd', 'e'], correct, 'partial').earned).toBe(0);
  });

  it('counts a question as correct only when the set is exact, even if partial credit was earned', () => {
    expect(scoreQuestion(q, ['a', 'b'], correct, 'partial').correct).toBe(false);
    expect(scoreQuestion(q, ['a', 'b', 'c'], correct, 'partial').correct).toBe(true);
  });

  it('penalises a wrong option against the right ones', () => {
    expect(scoreQuestion(q, ['a', 'b', 'd'], correct, 'partial').earned).toBeCloseTo((4 * (2 - 1)) / 3, 10);
  });
});

describe('unusable answers and keys', () => {
  it('ignores option ids that are not in the question', () => {
    const q = multiple('q1', 2);
    expect(scoreQuestion(q, ['a', 'c', 'zzz'], ['a', 'c'], 'all_or_nothing')).toMatchObject({ earned: 2, correct: true });
    expect(scoreQuestion(q, ['zzz'], ['a', 'c'], 'partial')).toMatchObject({ earned: 0, answered: false });
  });

  it('scores 0 when the key is empty or names only unknown options', () => {
    const q = single('q1');
    expect(scoreQuestion(q, ['a'], [], 'partial').earned).toBe(0);
    expect(scoreQuestion(q, ['a'], undefined, 'partial').earned).toBe(0);
    expect(scoreQuestion(q, ['a'], ['zzz'], 'partial').earned).toBe(0);
  });

  it('counts a repeated chosen id once', () => {
    expect(scoreQuestion(single('q1'), ['a', 'a'], ['a'], 'partial')).toMatchObject({ earned: 1, correct: true });
  });
});

describe('scoreAttempt', () => {
  const questions = [single('q1', 1), single('q2', 1), multiple('q3', 3)];
  const key = { q1: ['a'], q2: ['b'], q3: ['a', 'b', 'c'] };

  it('adds the questions up and reports the maximum', () => {
    const result = scoreAttempt({
      questions,
      answers: { q1: ['a'], q2: ['c'], q3: ['a', 'b', 'c'] },
      key,
      scoringMode: 'partial',
    });
    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(5);
    expect(result.perQuestion.map((p) => p.correct)).toEqual([true, false, true]);
  });

  it('rounds only the total, once', () => {
    // Three partial-credit questions of 1/3 each: the exact total is 1, not 3 × 0.33.
    const qs = [multiple('x', 1), multiple('y', 1), multiple('z', 1)];
    const k = { x: ['a', 'b', 'c'], y: ['a', 'b', 'c'], z: ['a', 'b', 'c'] };
    const result = scoreAttempt({ questions: qs, answers: { x: ['a'], y: ['a'], z: ['a'] }, key: k, scoringMode: 'partial' });
    expect(result.score).toBe(1);
    expect(result.perQuestion.every((p) => Math.abs(p.earned - 1 / 3) < 1e-12)).toBe(true);
  });

  it('scores an attempt with no answers at 0 out of the maximum', () => {
    expect(scoreAttempt({ questions, answers: undefined, key, scoringMode: 'partial' })).toMatchObject({ score: 0, maxScore: 5 });
    expect(scoreAttempt({ questions, answers: {}, key, scoringMode: 'all_or_nothing' }).perQuestion.every((p) => !p.answered)).toBe(true);
  });

  it('handles half points and an exam with no questions', () => {
    const q = single('q1', 0.5);
    expect(scoreAttempt({ questions: [q], answers: { q1: ['a'] }, key: { q1: ['a'] }, scoringMode: 'partial' })).toMatchObject({ score: 0.5, maxScore: 0.5 });
    expect(scoreAttempt({ questions: [], answers: {}, key: {}, scoringMode: 'partial' })).toMatchObject({ score: 0, maxScore: 0, perQuestion: [] });
  });
});
