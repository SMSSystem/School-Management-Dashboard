import { describe, expect, it } from 'vitest';
import {
  EXAM_ACT_KINDS,
  EXAM_ACTIVITY_KIND_LABELS,
  EXAM_ANSWER_MODES,
  EXAM_ANSWER_MODE_DESCRIPTIONS,
  EXAM_ANSWER_MODE_LABELS,
  EXAM_CATEGORY_LABELS,
  EXAM_CATEGORY_TYPES,
  EXAM_INTEGRITY_DEFAULT,
  EXAM_INTEGRITY_PRESETS,
  EXAM_INTEGRITY_PRESET_LABELS,
  EXAM_LEAVE_KINDS,
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
  isActivityKind,
  isLeaveKind,
  type ExamActivityEvent,
  type ExamAttemptDocument,
  type ExamQuestion,
  type ExamQuestionImage,
  type ExamGradeDocument,
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

describe('the activity log kinds', () => {
  it('are two leaves and seven acts, none in both lists, each with a label', () => {
    expect([...EXAM_LEAVE_KINDS]).toEqual(['hidden', 'blur']);
    expect([...EXAM_ACT_KINDS]).toEqual(['fs_exit', 'fs_unavailable', 'copy', 'cut', 'print', 'menu', 'app_tab']);
    expect(EXAM_LEAVE_KINDS.filter((k) => (EXAM_ACT_KINDS as readonly string[]).includes(k))).toEqual([]);
    for (const k of [...EXAM_LEAVE_KINDS, ...EXAM_ACT_KINDS]) expect(EXAM_ACTIVITY_KIND_LABELS[k], k).toBeTruthy();
    expect(Object.keys(EXAM_ACTIVITY_KIND_LABELS)).toHaveLength(EXAM_LEAVE_KINDS.length + EXAM_ACT_KINDS.length);
  });

  it('say "left", never that a tab was opened, because a browser cannot tell the two apart', () => {
    expect(EXAM_ACTIVITY_KIND_LABELS.hidden).toBe('Left the page (another tab, window or app)');
    expect(EXAM_ACTIVITY_KIND_LABELS.blur).toBe('Window lost focus');
    for (const label of Object.values(EXAM_ACTIVITY_KIND_LABELS).filter((l) => !/Another tab of this app/.test(l))) {
      expect(label).not.toMatch(/opened a (new )?tab|visited|website/i);
    }
  });

  it('are told apart by the guards, which accept only the known kinds', () => {
    for (const k of EXAM_LEAVE_KINDS) expect([isLeaveKind(k), isActivityKind(k)]).toEqual([true, true]);
    for (const k of EXAM_ACT_KINDS) expect([isLeaveKind(k), isActivityKind(k)]).toEqual([false, true]);
    for (const bad of ['paste', '', 'Hidden', undefined, null, 3, {}]) expect([isLeaveKind(bad), isActivityKind(bad)], String(bad)).toEqual([false, false]);
  });
});

describe('the activity log shapes and limits', () => {
  it('cap one attempt at 200 entries and the timeline on a grade at 50', () => {
    expect(EXAM_LIMITS.maxActivityEvents).toBe(200);
    expect(EXAM_LIMITS.maxTimelineEntries).toBe(50);
    expect(EXAM_LIMITS.maxTimelineEntries).toBeLessThan(EXAM_LIMITS.maxActivityEvents);
  });

  it('are all optional, so an attempt, a grade and an exam written before the log are still valid', () => {
    const oldAttempt = {} as Pick<ExamAttemptDocument, 'events' | 'answeredAt'>;
    const oldGrade = {} as Pick<ExamGradeDocument, 'integrity'>;
    expect(oldAttempt.events).toBeUndefined();
    expect(oldAttempt.answeredAt).toBeUndefined();
    expect(oldGrade.integrity).toBeUndefined();
    const text = norm(examTypesRaw);
    for (const field of ['events?: ExamActivityEvent[];', 'answeredAt?: Record<string, number>;', 'integrity?: ExamIntegritySummary;', 'integrity?: ExamIntegrityPreset;', 'forwardOnly?: boolean;']) {
      expect(text, field).toContain(field);
    }
  });

  it('write a leave with its duration and an act without one', () => {
    const leave: ExamActivityEvent = { t: 125, k: 'hidden', d: 31 };
    const act: ExamActivityEvent = { t: 140, k: 'copy' };
    expect([leave.k, leave.d]).toEqual(['hidden', 31]);
    expect(act.d).toBeUndefined();
  });
});

describe('the integrity presets', () => {
  it('are supervised and unsupervised, each with a label, and an exam without one is supervised', () => {
    expect([...EXAM_INTEGRITY_PRESETS]).toEqual(['supervised', 'unsupervised']);
    for (const p of EXAM_INTEGRITY_PRESETS) expect(EXAM_INTEGRITY_PRESET_LABELS[p], p).toBeTruthy();
    expect(EXAM_INTEGRITY_PRESET_LABELS).toEqual({ supervised: 'Supervised', unsupervised: 'Unsupervised' });
    expect(EXAM_INTEGRITY_DEFAULT).toBe('supervised');
    expect(EXAM_INTEGRITY_PRESETS).toContain(EXAM_INTEGRITY_DEFAULT);
  });
});

describe('the picture shapes', () => {
  it('are optional everywhere, so an exam, a question and a pack from before pictures are still valid', () => {
    const text = norm(examTypesRaw);
    for (const field of ['image?: ExamQuestionImage;', 'imagePacks?: number;', 'imageBytes?: number;', 'decorative?: boolean;']) expect(text, field).toContain(field);
    const question = { id: 'q', text: 'x', kind: 'single', options: [], points: 1 } as ExamQuestion;
    expect(question.image).toBeUndefined();
  });

  it('keep the reference small: where the picture is, its size, whether it is exact and its text for screen readers', () => {
    const image: ExamQuestionImage = { id: 'i1', pack: 2, w: 800, h: 600, bytes: 120_000, exact: true, alt: 'A bench vice' };
    expect(Object.keys(image).sort()).toEqual(['alt', 'bytes', 'exact', 'h', 'id', 'pack', 'w']);
  });
});

describe('the exam types file', () => {
  it('holds shapes and constants only: no Firebase app and no other module imports', () => {
    const imports = [...norm(examTypesRaw).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    expect(imports).toEqual(['firebase/firestore']);
    expect(norm(examTypesRaw)).toContain("import type { Timestamp } from 'firebase/firestore';");
  });
});
