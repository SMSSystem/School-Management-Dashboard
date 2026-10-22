import { describe, expect, it } from 'vitest';
import {
  autoGradeBlockers,
  canAutoGrade,
  isKeyComplete,
  totalPointsOf,
  validateKey,
  validateQuestions,
} from '../examKeyValidation';
import type { ExamQuestion } from '@/types/exams';

// Questions and answer key checks (EXAMS_FEATURE_SPEC.md §4.3 and §6.1).

const opts = (...ids: string[]) => ids.map((id) => ({ id, text: `Option ${id}` }));
const single = (id: string, over: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id, text: `Question ${id}`, kind: 'single', options: opts('a', 'b', 'c'), points: 1, ...over,
});
const multiple = (id: string, over: Partial<ExamQuestion> = {}): ExamQuestion => ({
  id, text: `Question ${id}`, kind: 'multiple', options: opts('a', 'b', 'c', 'd'), points: 2, ...over,
});
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('validateQuestions', () => {
  it('accepts a sound single-answer exam', () => {
    expect(validateQuestions([single('q1'), single('q2')], 'single')).toEqual([]);
  });

  it('needs an answer mode and at least one question', () => {
    expect(codes(validateQuestions([], undefined))).toEqual(['answer_mode_missing', 'no_questions']);
  });

  it('allows at most 100 questions', () => {
    const many = Array.from({ length: 101 }, (_, i) => single(`q${i}`));
    expect(codes(validateQuestions(many, 'single'))).toContain('too_many_questions');
    expect(codes(validateQuestions(many.slice(0, 100), 'single'))).not.toContain('too_many_questions');
  });

  it('checks the text and options of each question and names the question', () => {
    const issues = validateQuestions([single('q1', { text: '  ' }), single('q2', { options: opts('a') })], 'single');
    expect(codes(issues)).toEqual(['question_text_empty', 'option_count']);
    expect(issues[0].message.startsWith('Question 1:')).toBe(true);
    expect(issues[1].questionId).toBe('q2');
    expect(codes(validateQuestions([single('q1', { options: opts('a', 'b', 'c', 'd', 'e', 'f', 'g') })], 'single'))).toContain('option_count');
  });

  it('limits text lengths', () => {
    expect(codes(validateQuestions([single('q1', { text: 'x'.repeat(1001) })], 'single'))).toContain('question_text_long');
    expect(validateQuestions([single('q1', { text: 'x'.repeat(1000) })], 'single')).toEqual([]);
    const long = single('q1', { options: [{ id: 'a', text: 'x'.repeat(301) }, { id: 'b', text: 'ok' }] });
    expect(codes(validateQuestions([long], 'single'))).toContain('option_text_long');
    const empty = single('q1', { options: [{ id: 'a', text: '' }, { id: 'b', text: 'ok' }] });
    expect(codes(validateQuestions([empty], 'single'))).toContain('option_text_empty');
  });

  it('rejects repeated or missing ids', () => {
    expect(codes(validateQuestions([single('q1'), single('q1')], 'single'))).toContain('question_id_duplicate');
    expect(codes(validateQuestions([single('')], 'single'))).toContain('question_id_missing');
    const dup = single('q1', { options: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] });
    expect(codes(validateQuestions([dup], 'single'))).toContain('option_id');
  });

  it('keeps every question to the exam answer mode', () => {
    expect(codes(validateQuestions([single('q1'), multiple('q2')], 'single'))).toEqual(['kind_mismatch']);
    expect(codes(validateQuestions([single('q1'), multiple('q2')], 'multiple'))).toEqual(['kind_mismatch']);
    expect(validateQuestions([multiple('q1'), multiple('q2')], 'multiple')).toEqual([]);
  });

  it("needs at least one of each kind in a 'Both' exam", () => {
    expect(validateQuestions([single('q1'), multiple('q2')], 'both')).toEqual([]);
    expect(codes(validateQuestions([single('q1'), single('q2')], 'both'))).toEqual(['both_needs_each_kind']);
    expect(codes(validateQuestions([multiple('q1')], 'both'))).toEqual(['both_needs_each_kind']);
  });

  it('keeps points from 0.5 to 100 in steps of 0.5', () => {
    for (const ok of [0.5, 1, 1.5, 100]) expect(validateQuestions([single('q1', { points: ok })], 'single'), String(ok)).toEqual([]);
    for (const bad of [0, 0.25, 1.3, 100.5, -1, Number.NaN]) {
      expect(codes(validateQuestions([single('q1', { points: bad })], 'single')), String(bad)).toContain('points');
    }
  });
});

describe('validateKey', () => {
  const questions = [single('q1'), multiple('q2')];

  it('accepts a complete key', () => {
    expect(validateKey(questions, { q1: ['b'], q2: ['a', 'd'] })).toEqual([]);
  });

  it('needs a correct answer for every question', () => {
    expect(codes(validateKey(questions, { q1: ['b'] }))).toEqual(['key_missing']);
    expect(codes(validateKey(questions, undefined))).toEqual(['key_missing', 'key_missing']);
    expect(codes(validateKey(questions, { q1: [], q2: ['a', 'b'] }))).toEqual(['key_missing']);
  });

  it('needs exactly one correct option for a single question and at least two for a multiple question', () => {
    expect(codes(validateKey(questions, { q1: ['a', 'b'], q2: ['a', 'b'] }))).toEqual(['key_single_count']);
    expect(codes(validateKey(questions, { q1: ['a'], q2: ['a'] }))).toEqual(['key_multiple_count']);
  });

  it('treats a repeated id as one answer', () => {
    expect(codes(validateKey(questions, { q1: ['a'], q2: ['a', 'a'] }))).toEqual(['key_multiple_count']);
  });

  it('refuses options that do not exist and answers for questions that do not exist', () => {
    expect(codes(validateKey(questions, { q1: ['zzz'], q2: ['a', 'b'] }))).toEqual(['key_unknown_option']);
    expect(codes(validateKey(questions, { q1: ['a'], q2: ['a', 'b'], gone: ['a'] }))).toEqual(['key_unknown_question']);
  });
});

describe('isKeyComplete and totalPointsOf', () => {
  it('is complete only with questions and a valid key', () => {
    expect(isKeyComplete([], {})).toBe(false);
    expect(isKeyComplete([single('q1')], { q1: ['a'] })).toBe(true);
    expect(isKeyComplete([single('q1')], {})).toBe(false);
  });

  it('adds the points, rounded to two decimals', () => {
    expect(totalPointsOf([single('q1', { points: 0.5 }), multiple('q2', { points: 2.5 })])).toBe(3);
    expect(totalPointsOf([])).toBe(0);
  });
});

describe('Auto-Grade', () => {
  const questions = [single('q1'), multiple('q2')];
  const key = { q1: ['a'], q2: ['a', 'b'] };

  it('is blocked for every category except Multiple Choice', () => {
    expect(codes(autoGradeBlockers('short_answer', questions, key, 'both'))).toEqual(['category']);
    expect(codes(autoGradeBlockers(undefined, questions, key, 'both'))).toEqual(['category']);
  });

  it('is blocked by invalid questions or an incomplete key, and lists why', () => {
    expect(autoGradeBlockers('multiple_choice', questions, key, 'both')).toEqual([]);
    expect(codes(autoGradeBlockers('multiple_choice', questions, { q1: ['a'] }, 'both'))).toEqual(['key_missing']);
    expect(codes(autoGradeBlockers('multiple_choice', [], {}, 'both'))).toEqual(['no_questions']);
  });

  it('runs only when the teacher opted in and nothing blocks it', () => {
    const exam = { categoryType: 'multiple_choice' as const, answerMode: 'both' as const };
    expect(canAutoGrade({ ...exam, autoGrade: true }, questions, key)).toBe(true);
    expect(canAutoGrade({ ...exam, autoGrade: false }, questions, key)).toBe(false);
    expect(canAutoGrade({ ...exam }, questions, key)).toBe(false);
    expect(canAutoGrade({ ...exam, autoGrade: true }, questions, { q1: ['a'] })).toBe(false);
    expect(canAutoGrade({ ...exam, categoryType: undefined, autoGrade: true }, questions, key)).toBe(false);
  });
});
