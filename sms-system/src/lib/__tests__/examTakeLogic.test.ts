import { describe, expect, it } from 'vitest';
import { ADVANCE_HINT, answeredCount, canAdvance, canGoTo, canSubmit, isAnswered, navigatorState, previewQuestions, submitHint, toggleAnswer, toggleFlag, unansweredCount } from '../examTakeLogic';
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

describe('unanswered questions and the Submit gate', () => {
  it('counts the questions that have no answer, as "Answered N of M" does', () => {
    expect(unansweredCount(questions, {})).toBe(3);
    expect(unansweredCount(questions, { one: ['onea'] })).toBe(2);
    expect(unansweredCount(questions, { one: ['onea'], two: ['twoa', 'twob'], three: ['threec'] })).toBe(0);
    expect(unansweredCount(questions, { one: ['nope'] })).toBe(3);
    expect(unansweredCount(questions, { one: [] })).toBe(3);
  });

  it('allows Submit only when every question is answered', () => {
    expect(canSubmit(questions, { one: ['onea'], two: ['twoa'] })).toBe(false);
    expect(canSubmit(questions, { one: ['onea'], two: ['twoa'], three: ['threeb'] })).toBe(true);
  });

  it('does not take a flag for an answer: nothing answered stays unsubmittable', () => {
    expect(canSubmit(questions, {})).toBe(false);
  });

  it('says how many are left, in the singular too, and nothing when none are', () => {
    expect(submitHint(3)).toBe('Answer all questions to submit (3 left)');
    expect(submitHint(1)).toBe('Answer all questions to submit (1 left)');
    expect(submitHint(0)).toBe('');
  });
});

describe('leaving a question in a forward-only exam', () => {
  it('is always allowed in a free exam, answered or not', () => {
    expect(canAdvance(questions[0], {}, false)).toBe(true);
    expect(canAdvance(undefined, {}, false)).toBe(true);
  });

  it('needs an answer in a forward-only exam', () => {
    expect(canAdvance(questions[0], {}, true)).toBe(false);
    expect(canAdvance(questions[0], { one: ['nope'] }, true)).toBe(false);
    expect(canAdvance(questions[0], { one: ['onea'] }, true)).toBe(true);
    expect(canAdvance(undefined, { one: ['onea'] }, true)).toBe(false);
  });

  it('has a hint for the wait', () => {
    expect(ADVANCE_HINT).toBe('Choose an answer to continue');
  });

  it('is what canGoTo uses for the step to the next question, and nothing else', () => {
    expect(canGoTo(1, 2, true, 4, false)).toBe(false);
    expect(canGoTo(1, 2, true, 4, true)).toBe(true);
    expect(canGoTo(1, 1, true, 4, false)).toBe(true);
    expect(canGoTo(1, 0, true, 4, true)).toBe(false);
    expect(canGoTo(1, 3, true, 4, true)).toBe(false);
    expect(canGoTo(1, 3, false, 4, false)).toBe(true);
    expect(canGoTo(1, 0, false, 4, false)).toBe(true);
  });

  it('asks nothing of the answer when the caller does not pass it', () => {
    expect(canGoTo(1, 2, true, 4)).toBe(true);
  });
});
