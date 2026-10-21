import { describe, expect, it } from 'vitest';
import { defaultRng, makeAttemptOrder, orderQuestions, reconcileOrder, seededRandom, shuffled } from '../examShuffle';
import { scoreAttempt } from '../examScoring';
import type { ExamQuestion } from '@/types/exams';

// A student's own order of questions and options (EXAMS_FEATURE_SPEC.md §4.5).

const opts = (...ids: string[]) => ids.map((id) => ({ id, text: `Option ${id}` }));
const q = (id: string, optionIds = ['a', 'b', 'c', 'd']): ExamQuestion => ({
  id, text: `Question ${id}`, kind: 'single', options: opts(...optionIds), points: 1,
});
const questions = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((id) => q(id));
const sorted = (xs: readonly string[]) => [...xs].sort();

describe('random sources', () => {
  it('a seeded generator repeats and stays in [0, 1)', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const first = Array.from({ length: 50 }, () => a());
    expect(first).toEqual(Array.from({ length: 50 }, () => b()));
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(seededRandom(8)()).not.toBe(seededRandom(7)());
  });

  it('the default generator gives numbers in [0, 1)', () => {
    const rng = defaultRng();
    for (let i = 0; i < 20; i += 1) {
      const n = rng();
      expect(n >= 0 && n < 1).toBe(true);
    }
  });
});

describe('shuffled', () => {
  it('is a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(input, seededRandom(3));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out).not.toEqual(input);
  });

  it('gives different orders for different seeds and handles tiny lists', () => {
    expect(shuffled([1, 2, 3, 4, 5, 6], seededRandom(1))).not.toEqual(shuffled([1, 2, 3, 4, 5, 6], seededRandom(2)));
    expect(shuffled([], seededRandom(1))).toEqual([]);
    expect(shuffled([9], seededRandom(1))).toEqual([9]);
  });
});

describe('makeAttemptOrder', () => {
  it('keeps the written order when the exam does not shuffle', () => {
    expect(makeAttemptOrder(questions, false, seededRandom(1))).toEqual({
      questions: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'],
      options: Object.fromEntries(questions.map((x) => [x.id, ['a', 'b', 'c', 'd']])),
    });
  });

  it('shuffles questions and each question’s options, using every id exactly once', () => {
    const order = makeAttemptOrder(questions, true, seededRandom(5));
    expect(sorted(order.questions)).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
    for (const x of questions) expect(sorted(order.options[x.id])).toEqual(['a', 'b', 'c', 'd']);
    expect(order.questions).not.toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
  });

  it('is repeatable for a given generator', () => {
    expect(makeAttemptOrder(questions, true, seededRandom(11))).toEqual(makeAttemptOrder(questions, true, seededRandom(11)));
  });
});

describe('reconcileOrder', () => {
  it('returns a valid stored order unchanged', () => {
    const order = makeAttemptOrder(questions, true, seededRandom(2));
    expect(reconcileOrder(order, questions)).toEqual(order);
  });

  it('builds the natural order when there is none', () => {
    expect(reconcileOrder(undefined, questions).questions).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6']);
    expect(reconcileOrder({ questions: [], options: {} }, [q('x')]).options.x).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops ids the exam no longer has and adds new ones at the end', () => {
    const order = { questions: ['q3', 'gone', 'q1'], options: { q3: ['d', 'x', 'a'], q1: ['b'] } };
    const out = reconcileOrder(order, [q('q1'), q('q3'), q('q9')]);
    expect(out.questions).toEqual(['q3', 'q1', 'q9']);
    expect(out.options.q3).toEqual(['d', 'a', 'b', 'c']);
    expect(out.options.q1).toEqual(['b', 'a', 'c', 'd']);
    expect(out.options.q9).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores a repeated id in a stored order', () => {
    expect(reconcileOrder({ questions: ['q2', 'q2', 'q1'], options: {} }, [q('q1'), q('q2')]).questions).toEqual(['q2', 'q1']);
  });
});

describe('orderQuestions', () => {
  it('returns the questions and their options in the student’s order', () => {
    const order = { questions: ['q2', 'q1'], options: { q1: ['c', 'a', 'b', 'd'], q2: ['d', 'c', 'b', 'a'] } };
    const out = orderQuestions([q('q1'), q('q2')], order);
    expect(out.map((x) => x.id)).toEqual(['q2', 'q1']);
    expect(out[0].options.map((o) => o.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(out[1].options.map((o) => o.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(out[1].options.find((o) => o.id === 'c')?.text).toBe('Option c');
  });

  it('does not change the questions it was given', () => {
    const original = [q('q1'), q('q2')];
    orderQuestions(original, { questions: ['q2', 'q1'], options: { q1: ['d', 'c', 'b', 'a'], q2: ['d', 'c', 'b', 'a'] } });
    expect(original[0].options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('copes with questions that changed since the order was made', () => {
    const out = orderQuestions([q('q1'), q('q9')], { questions: ['q1', 'gone'], options: {} });
    expect(out.map((x) => x.id)).toEqual(['q1', 'q9']);
  });
});

describe('shuffling and grading', () => {
  it('does not change the score, because answers are stored by id', () => {
    const key = Object.fromEntries(questions.map((x) => [x.id, ['b']]));
    const answers = Object.fromEntries(questions.map((x, i) => [x.id, i % 2 === 0 ? ['b'] : ['c']]));
    const plain = scoreAttempt({ questions, answers, key, scoringMode: 'partial' });
    const order = makeAttemptOrder(questions, true, seededRandom(9));
    const shownInOrder = orderQuestions(questions, order);
    const afterShuffle = scoreAttempt({ questions: shownInOrder, answers, key, scoringMode: 'partial' });
    expect(afterShuffle.score).toBe(plain.score);
    expect(afterShuffle.maxScore).toBe(plain.maxScore);
  });
});
