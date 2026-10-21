import { describe, expect, it } from 'vitest';
import { canTransition, publishBlockers, validateExamSettings, type ExamSettingsInput } from '../examSettings';
import type { ExamQuestion } from '@/types/exams';

// The settings and status checks the exam form, the builder and the staff screens share
// (EXAMS_FEATURE_SPEC.md §4.1, §4.2, §7).

const T0 = 1_800_000_000_000;
const MIN = 60_000;
const valid: ExamSettingsInput = {
  title: 'Unit 3 Quiz',
  valueType: 'quiz',
  categoryType: 'multiple_choice',
  answerMode: 'single',
  durationMinutes: 45,
  opensAtMs: T0,
  closesAtMs: T0 + 60 * MIN,
  releaseMode: 'auto',
};
const codes = (s: ExamSettingsInput) => validateExamSettings(s).map((i) => i.code);

describe('validateExamSettings', () => {
  it('accepts a complete set of settings', () => {
    expect(validateExamSettings(valid)).toEqual([]);
  });

  it('needs a title of 1 to 120 characters', () => {
    expect(codes({ ...valid, title: '  ' })).toEqual(['title']);
    expect(codes({ ...valid, title: undefined })).toEqual(['title']);
    expect(codes({ ...valid, title: 'x'.repeat(121) })).toEqual(['title']);
    expect(codes({ ...valid, title: 'x'.repeat(120) })).toEqual([]);
  });

  it('needs a type, and a name for "Other" of up to 50 characters', () => {
    expect(codes({ ...valid, valueType: undefined })).toEqual(['value_type']);
    expect(codes({ ...valid, valueType: 'other' })).toEqual(['value_type_label']);
    expect(codes({ ...valid, valueType: 'other', valueTypeLabel: 'x'.repeat(51) })).toEqual(['value_type_label']);
    expect(codes({ ...valid, valueType: 'other', valueTypeLabel: 'Spelling bee' })).toEqual([]);
  });

  it('accepts only the categories that can be chosen, and needs an answer mode for Multiple Choice', () => {
    expect(codes({ ...valid, categoryType: undefined })).toEqual(['category']);
    expect(codes({ ...valid, categoryType: 'short_answer' })).toEqual(['category_unavailable']);
    expect(codes({ ...valid, categoryType: 'drag_and_drop' })).toEqual(['category_unavailable']);
    expect(codes({ ...valid, answerMode: undefined })).toEqual(['answer_mode']);
  });

  it('keeps the duration a whole number from 5 to 300 minutes', () => {
    // A wide window, so only the duration can be wrong.
    const wide = { closesAtMs: T0 + 1000 * MIN };
    for (const bad of [4, 301, 12.5, Number.NaN, undefined]) expect(codes({ ...valid, ...wide, durationMinutes: bad as number }), String(bad)).toEqual(['duration']);
    for (const ok of [5, 300]) expect(codes({ ...valid, ...wide, durationMinutes: ok }), String(ok)).toEqual([]);
  });

  it('needs a window that closes after it opens and is long enough for the duration', () => {
    expect(codes({ ...valid, opensAtMs: undefined })).toEqual(['window']);
    expect(codes({ ...valid, closesAtMs: T0 })).toEqual(['window_order']);
    expect(codes({ ...valid, closesAtMs: T0 + 30 * MIN })).toEqual(['window_short']);
    expect(codes({ ...valid, closesAtMs: T0 + 45 * MIN })).toEqual([]);
  });

  it('needs a scoring mode only when a question can have several answers', () => {
    expect(codes({ ...valid, answerMode: 'multiple' })).toEqual(['scoring_mode']);
    expect(codes({ ...valid, answerMode: 'both' })).toEqual(['scoring_mode']);
    expect(codes({ ...valid, answerMode: 'both', scoringMode: 'partial' })).toEqual([]);
    expect(codes({ ...valid, answerMode: 'single' })).toEqual([]);
  });

  it('needs a release mode, and for a scheduled release a time that is not before the close', () => {
    expect(codes({ ...valid, releaseMode: undefined })).toEqual(['release_mode']);
    expect(codes({ ...valid, releaseMode: 'scheduled' })).toEqual(['release_at']);
    expect(codes({ ...valid, releaseMode: 'scheduled', releaseAtMs: T0 + 10 * MIN })).toEqual(['release_before_close']);
    expect(codes({ ...valid, releaseMode: 'scheduled', releaseAtMs: T0 + 60 * MIN })).toEqual([]);
    expect(codes({ ...valid, releaseMode: 'manual' })).toEqual([]);
  });

  it('keeps the checkpoint interval a whole number from 5 to 15 minutes, and optional', () => {
    expect(codes({ ...valid, checkpointMinutes: 10 })).toEqual([]);
    for (const bad of [4, 16, 7.5]) expect(codes({ ...valid, checkpointMinutes: bad }), String(bad)).toEqual(['checkpoint']);
    expect(codes({ ...valid, checkpointMinutes: undefined })).toEqual([]);
  });
});

describe('canTransition', () => {
  const ctx = { hasAttempts: false, nowMs: T0, closesAtMs: T0 + 60 * MIN };

  it('publishes a draft', () => {
    expect(canTransition('draft', 'published', ctx)).toBe(true);
    expect(canTransition('draft', 'closed', ctx)).toBe(false);
    expect(canTransition('draft', 'finalized', ctx)).toBe(false);
  });

  it('closes a published exam, and returns it to a draft only while nobody has started', () => {
    expect(canTransition('published', 'closed', ctx)).toBe(true);
    expect(canTransition('published', 'closed', { ...ctx, hasAttempts: true })).toBe(true);
    expect(canTransition('published', 'draft', ctx)).toBe(true);
    expect(canTransition('published', 'draft', { ...ctx, hasAttempts: true })).toBe(false);
    expect(canTransition('published', 'finalized', ctx)).toBe(false);
  });

  it('reopens a closed exam only before its window ends, and finalizes it', () => {
    expect(canTransition('closed', 'published', ctx)).toBe(true);
    expect(canTransition('closed', 'published', { ...ctx, nowMs: T0 + 61 * MIN })).toBe(false);
    expect(canTransition('closed', 'published', { ...ctx, closesAtMs: undefined })).toBe(false);
    expect(canTransition('closed', 'finalized', ctx)).toBe(true);
    expect(canTransition('closed', 'draft', ctx)).toBe(false);
  });

  it('never leaves finalized', () => {
    for (const to of ['draft', 'published', 'closed', 'finalized'] as const) expect(canTransition('finalized', to, ctx), to).toBe(false);
  });
});

describe('publishBlockers', () => {
  const opts = (...ids: string[]) => ids.map((id) => ({ id, text: `Option ${id}` }));
  const questions: ExamQuestion[] = [
    { id: 'q1', text: 'One', kind: 'single', options: opts('a', 'b'), points: 1 },
    { id: 'q2', text: 'Two', kind: 'single', options: opts('a', 'b'), points: 1 },
  ];
  const now = T0 - 10 * MIN;
  const blockers = (s: ExamSettingsInput, qs = questions, key?: Record<string, string[]>) => publishBlockers(s, qs, key, now).map((b) => b.code);

  it('has nothing in the way for valid settings and questions, without Auto-Grade', () => {
    expect(blockers(valid)).toEqual([]);
  });

  it('collects settings and question problems together', () => {
    expect(blockers({ ...valid, title: '' }, [])).toEqual(['title', 'no_questions']);
  });

  it('is blocked by a window that has already closed', () => {
    expect(publishBlockers(valid, questions, undefined, T0 + 61 * MIN).map((b) => b.code)).toEqual(['window_passed']);
  });

  it('needs a complete key only when Auto-Grade is on', () => {
    expect(blockers({ ...valid, autoGrade: false }, questions, { q1: ['a'] })).toEqual([]);
    expect(blockers({ ...valid, autoGrade: true }, questions, { q1: ['a'] })).toEqual(['key_missing']);
    expect(blockers({ ...valid, autoGrade: true }, questions, { q1: ['a'], q2: ['b'] })).toEqual([]);
  });
});
