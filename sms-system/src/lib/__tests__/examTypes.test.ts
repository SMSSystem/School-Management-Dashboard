import { describe, expect, it } from 'vitest';
import {
  EXAM_ANSWER_MODES,
  EXAM_ANSWER_MODE_DESCRIPTIONS,
  EXAM_ANSWER_MODE_LABELS,
  EXAM_CATEGORY_LABELS,
  EXAM_CATEGORY_TYPES,
  EXAM_LIMITS,
  EXAM_RELEASE_MODES,
  EXAM_RELEASE_MODE_LABELS,
  EXAM_SCORING_MODES,
  EXAM_SCORING_MODE_LABELS,
  EXAM_SELECTABLE_CATEGORIES,
  EXAM_STATUSES,
  EXAM_STATUS_LABELS,
  EXAM_VALUE_TYPES,
  EXAM_VALUE_TYPE_LABELS,
} from '@/types/exams';
import examTypesRaw from '../../types/exams.ts?raw';

// The constants and limits of the online exams (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md). The limits are
// the same numbers firestore.rules will enforce, so they are pinned here against the spec.

const norm = (s: string) => s.split('\r\n').join('\n');

describe('exam value types', () => {
  it('are the eight types of the spec, each with a label', () => {
    expect([...EXAM_VALUE_TYPES]).toEqual(['quiz', 'test', 'exam', 'end_of_term', 'end_of_year', 'mock', 'open_book', 'other']);
    for (const t of EXAM_VALUE_TYPES) expect(EXAM_VALUE_TYPE_LABELS[t], t).toBeTruthy();
    expect(EXAM_VALUE_TYPE_LABELS.end_of_term).toBe('End of term Exam');
    expect(EXAM_VALUE_TYPE_LABELS.open_book).toBe('Open Book');
  });
});

describe('exam categories', () => {
  it('are the twelve of the spec, each with a label', () => {
    expect(EXAM_CATEGORY_TYPES).toHaveLength(12);
    for (const c of EXAM_CATEGORY_TYPES) expect(EXAM_CATEGORY_LABELS[c], c).toBeTruthy();
    expect(EXAM_CATEGORY_LABELS.matching).toBe('Matching (Corresponding Pairs)');
    expect(EXAM_CATEGORY_LABELS.problem_solving).toBe('Problem Solving / Computational');
  });

  it('can be chosen only for Multiple Choice for now', () => {
    expect([...EXAM_SELECTABLE_CATEGORIES]).toEqual(['multiple_choice']);
    for (const c of EXAM_SELECTABLE_CATEGORIES) expect(EXAM_CATEGORY_TYPES).toContain(c);
  });
});

describe('exam answer modes, statuses, scoring and release', () => {
  it('have a label for every value, and a description for every answer mode', () => {
    expect([...EXAM_ANSWER_MODES]).toEqual(['single', 'multiple', 'both']);
    for (const m of EXAM_ANSWER_MODES) {
      expect(EXAM_ANSWER_MODE_LABELS[m], m).toBeTruthy();
      expect(EXAM_ANSWER_MODE_DESCRIPTIONS[m], m).toBeTruthy();
    }
    expect([...EXAM_STATUSES]).toEqual(['draft', 'published', 'closed', 'finalized']);
    for (const s of EXAM_STATUSES) expect(EXAM_STATUS_LABELS[s], s).toBeTruthy();
    expect([...EXAM_SCORING_MODES]).toEqual(['all_or_nothing', 'partial']);
    for (const s of EXAM_SCORING_MODES) expect(EXAM_SCORING_MODE_LABELS[s], s).toBeTruthy();
    expect([...EXAM_RELEASE_MODES]).toEqual(['auto', 'scheduled', 'manual']);
    for (const r of EXAM_RELEASE_MODES) expect(EXAM_RELEASE_MODE_LABELS[r], r).toBeTruthy();
  });
});

describe('exam limits', () => {
  it('match the spec (§3 row 15, §4.1, §5)', () => {
    expect(EXAM_LIMITS.maxQuestions).toBe(100);
    expect([EXAM_LIMITS.minOptions, EXAM_LIMITS.maxOptions]).toEqual([2, 6]);
    expect([EXAM_LIMITS.questionTextMax, EXAM_LIMITS.optionTextMax]).toEqual([1000, 300]);
    expect([EXAM_LIMITS.titleMax, EXAM_LIMITS.otherLabelMax]).toEqual([120, 50]);
    expect([EXAM_LIMITS.minDurationMinutes, EXAM_LIMITS.maxDurationMinutes]).toEqual([5, 300]);
    expect([EXAM_LIMITS.minCheckpointMinutes, EXAM_LIMITS.defaultCheckpointMinutes, EXAM_LIMITS.maxCheckpointMinutes]).toEqual([5, 10, 15]);
    expect(EXAM_LIMITS.maxExtraMinutes).toBe(120);
    expect([EXAM_LIMITS.minPoints, EXAM_LIMITS.maxPoints, EXAM_LIMITS.pointsStep]).toEqual([0.5, 100, 0.5]);
    expect(EXAM_LIMITS.submitGraceSeconds).toBe(60);
    expect(EXAM_LIMITS.questionsReadableAfterCloseMinutes).toBe(120);
    expect(EXAM_LIMITS.defaultCloseMarginMinutes).toBe(15);
  });

  it('keep the default checkpoint interval inside its range', () => {
    expect(EXAM_LIMITS.defaultCheckpointMinutes).toBeGreaterThanOrEqual(EXAM_LIMITS.minCheckpointMinutes);
    expect(EXAM_LIMITS.defaultCheckpointMinutes).toBeLessThanOrEqual(EXAM_LIMITS.maxCheckpointMinutes);
  });
});

describe('the exam types file', () => {
  it('holds shapes and constants only: no Firebase app and no other module imports', () => {
    const imports = [...norm(examTypesRaw).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports).toEqual(['firebase/firestore']);
    expect(norm(examTypesRaw)).toContain("import type { Timestamp } from 'firebase/firestore';");
  });
});
