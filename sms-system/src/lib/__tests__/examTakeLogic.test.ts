import { describe, expect, it } from 'vitest';
import { answeredCount, isAnswered, navigatorState, previewQuestions, toggleAnswer, toggleFlag } from '../examTakeLogic';
import { seededRandom } from '../examShuffle';
import type { ExamQuestion } from '@/types/exams';

// What a student's question screen needs, shared by the preview and the attempt (EXAMS_FEATURE_SPEC.md §4.5).

const q = (id: string, kind: 'single' | 'multiple'): ExamQuestion => ({
  id,
  text: id,
  kind,
  options: [
    { id: `${id}a`, text: 'A' },
    { id: `${id}b`, text: 'B' },
    { id: `${id}c`, text: 'C' },
  ],
  points: 1,
});
const questions = [q('one', 'single'), q('two', 'multiple'), q('three', 'single')];

describe('answered questions', () => {
  it('counts a question as answered when one of its own options is chosen', () => {
    expect(isAnswered(questions[0], { one: ['onea'] })).toBe(true);
    expect(isAnswered(questions[0], {})).toBe(false);
    expect(isAnswered(questions[0], { one: [] })).toBe(false);
    expect(isAnswered(questions[0], { one: ['stranger'] })).toBe(false);
  });

  it('counts the answered questions', () => {
    expect(answeredCount(questions, { one: ['onea'], two: ['twob', 'twoc'], three: [] })).toBe(2);
    expect(answeredCount([], {})).toBe(0);
  });
});

describe('navigatorState', () => {
  it('numbers the questions in order and shows answered and flagged', () => {
    const items = navigatorState(questions, { two: ['twoa'] }, ['three', 'two']);
    expect(items).toEqual([
      { id: 'one', number: 1, answered: false, flagged: false },
      { id: 'two', number: 2, answered: true, flagged: true },
      { id: 'three', number: 3, answered: false, flagged: true },
    ]);
  });
});

describe('toggleAnswer', () => {
  it('replaces the choice on a single question', () => {
    expect(toggleAnswer(questions[0], undefined, 'onea')).toEqual(['onea']);
    expect(toggleAnswer(questions[0], ['onea'], 'oneb')).toEqual(['oneb']);
    expect(toggleAnswer(questions[0], ['oneb'], 'oneb')).toEqual(['oneb']);
  });

  it('toggles on a multiple question', () => {
    let chosen = toggleAnswer(questions[1], undefined, 'twoa');
    chosen = toggleAnswer(questions[1], chosen, 'twoc');
    expect(chosen).toEqual(['twoa', 'twoc']);
    expect(toggleAnswer(questions[1], chosen, 'twoa')).toEqual(['twoc']);
  });

  it('ignores an option the question does not have and does not change its input', () => {
    const chosen = ['twoa'];
    expect(toggleAnswer(questions[1], chosen, 'nope')).toEqual(['twoa']);
    toggleAnswer(questions[1], chosen, 'twob');
    expect(chosen).toEqual(['twoa']);
  });
});

describe('toggleFlag', () => {
  it('adds and removes a flag', () => {
    expect(toggleFlag([], 'one')).toEqual(['one']);
    expect(toggleFlag(['one', 'two'], 'one')).toEqual(['two']);
  });
});

describe('previewQuestions', () => {
  it('keeps the teacher’s order when the exam does not shuffle', () => {
    const out = previewQuestions(questions, false, seededRandom(1));
    expect(out.questions.map((x) => x.id)).toEqual(['one', 'two', 'three']);
    expect(out.questions[0].options.map((o) => o.id)).toEqual(['onea', 'oneb', 'onec']);
  });

  it('shuffles questions and options when the exam shuffles, without losing any', () => {
    const out = previewQuestions(questions, true, seededRandom(5));
    expect(out.questions.map((x) => x.id).sort()).toEqual(['one', 'three', 'two']);
    for (const shown of out.questions) expect(shown.options.map((o) => o.id).sort()).toEqual([`${shown.id}a`, `${shown.id}b`, `${shown.id}c`]);
    expect(out.order.questions).toEqual(out.questions.map((x) => x.id));
  });
});
