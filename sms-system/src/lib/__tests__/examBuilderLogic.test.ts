import { describe, expect, it } from 'vitest';
import {
  addOption,
  applyKeyCorrections,
  contentCounts,
  defaultKind,
  draftChanged,
  duplicateQuestion,
  editMode,
  groupIssues,
  joinDraft,
  moveQuestion,
  newId,
  newQuestion,
  nextKeyRevision,
  removeOption,
  sameAnswers,
  setKind,
  setOptionText,
  splitDraft,
  toggleCorrect,
  type BuilderQuestion,
} from '../examBuilderLogic';
import { seededRandom } from '../examShuffle';
import { validateKey, validateQuestions } from '../examKeyValidation';
import { EXAM_LIMITS } from '@/types/exams';

// What the exam builder does to its list of questions (EXAMS_FEATURE_SPEC.md §4.3).

const rng = () => seededRandom(7);

const question = (id: string, kind: 'single' | 'multiple', correct: string[], extra: Partial<BuilderQuestion> = {}): BuilderQuestion => ({
  id,
  text: `Question ${id}`,
  kind,
  options: [
    { id: `${id}a`, text: 'A' },
    { id: `${id}b`, text: 'B' },
    { id: `${id}c`, text: 'C' },
  ],
  points: 1,
  correct,
  ...extra,
});

describe('new questions and ids', () => {
  it('makes short ids that differ from one another', () => {
    const r = rng();
    const ids = new Set(Array.from({ length: 200 }, () => newId('q', r)));
    expect(ids.size).toBe(200);
    expect([...ids].every((id) => /^q[a-z0-9]{8}$/.test(id))).toBe(true);
  });

  it('starts a question with two empty options, one point and no answer', () => {
    const q = newQuestion('multiple', rng());
    expect(q.kind).toBe('multiple');
    expect(q.options).toHaveLength(2);
    expect(q.options.every((o) => o.text === '')).toBe(true);
    expect(q.points).toBe(1);
    expect(q.correct).toEqual([]);
    expect(new Set(q.options.map((o) => o.id)).size).toBe(2);
  });

  it('starts as multiple only in a Multiple-answer exam', () => {
    expect(defaultKind('multiple')).toBe('multiple');
    expect(defaultKind('single')).toBe('single');
    expect(defaultKind('both')).toBe('single');
    expect(defaultKind(undefined)).toBe('single');
  });
});

describe('options', () => {
  it('adds options up to six and removes down to two', () => {
    let q = question('q1', 'single', []);
    const r = rng();
    for (let i = 0; i < 6; i += 1) q = addOption(q, r);
    expect(q.options).toHaveLength(EXAM_LIMITS.maxOptions);
    while (q.options.length > EXAM_LIMITS.minOptions) q = removeOption(q, q.options[q.options.length - 1].id);
    expect(q.options).toHaveLength(EXAM_LIMITS.minOptions);
    expect(removeOption(q, q.options[0].id)).toBe(q);
  });

  it('forgets the answer that belongs to a removed option', () => {
    const q = removeOption(question('q1', 'multiple', ['q1a', 'q1c']), 'q1c');
    expect(q.options.map((o) => o.id)).toEqual(['q1a', 'q1b']);
    expect(q.correct).toEqual(['q1a']);
  });

  it('changes one option text and leaves the rest', () => {
    const q = setOptionText(question('q1', 'single', []), 'q1b', 'Changed');
    expect(q.options.map((o) => o.text)).toEqual(['A', 'Changed', 'C']);
  });
});

describe('choosing the correct options', () => {
  it('replaces the answer of a single question', () => {
    let q = question('q1', 'single', []);
    q = toggleCorrect(q, 'q1b');
    q = toggleCorrect(q, 'q1c');
    expect(q.correct).toEqual(['q1c']);
    expect(toggleCorrect(q, 'q1c').correct).toEqual(['q1c']);
  });

  it('toggles the answers of a multiple question', () => {
    let q = question('q1', 'multiple', []);
    q = toggleCorrect(q, 'q1a');
    q = toggleCorrect(q, 'q1c');
    expect(q.correct).toEqual(['q1a', 'q1c']);
    expect(toggleCorrect(q, 'q1a').correct).toEqual(['q1c']);
  });

  it('ignores an option the question does not have', () => {
    const q = question('q1', 'single', ['q1a']);
    expect(toggleCorrect(q, 'nope')).toBe(q);
  });

  it('keeps only the first correct option (in option order) when a multiple question becomes single', () => {
    const q = setKind(question('q1', 'multiple', ['q1c', 'q1b']), 'single');
    expect(q.kind).toBe('single');
    expect(q.correct).toEqual(['q1b']);
    expect(setKind(question('q1', 'multiple', []), 'single').correct).toEqual([]);
    expect(setKind(question('q1', 'single', ['q1a']), 'multiple').correct).toEqual(['q1a']);
  });
});

describe('the list of questions', () => {
  const list = [question('a', 'single', []), question('b', 'single', []), question('c', 'single', [])];

  it('moves a question up or down and ignores a move off either end', () => {
    expect(moveQuestion(list, 1, -1).map((q) => q.id)).toEqual(['b', 'a', 'c']);
    expect(moveQuestion(list, 1, 1).map((q) => q.id)).toEqual(['a', 'c', 'b']);
    expect(moveQuestion(list, 0, -1).map((q) => q.id)).toEqual(['a', 'b', 'c']);
    expect(moveQuestion(list, 2, 1).map((q) => q.id)).toEqual(['a', 'b', 'c']);
    expect(list.map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });

  it('duplicates a question straight after it with new ids and the same answers', () => {
    const withAnswer = [question('a', 'multiple', ['aa', 'ac']), question('b', 'single', [])];
    const out = duplicateQuestion(withAnswer, 0, rng());
    expect(out).toHaveLength(3);
    expect(out[2].id).toBe('b');
    const [original, copy] = out;
    expect(copy.id).not.toBe(original.id);
    expect(copy.text).toBe(original.text);
    expect(copy.options.map((o) => o.text)).toEqual(['A', 'B', 'C']);
    expect(copy.options.every((o) => !original.options.some((x) => x.id === o.id))).toBe(true);
    expect(copy.correct).toEqual([copy.options[0].id, copy.options[2].id]);
  });

  it('does not duplicate past the question limit', () => {
    const full = Array.from({ length: EXAM_LIMITS.maxQuestions }, (_, i) => question(`q${i}`, 'single', []));
    expect(duplicateQuestion(full, 0, rng())).toHaveLength(EXAM_LIMITS.maxQuestions);
    expect(duplicateQuestion(list, 9, rng())).toHaveLength(3);
  });
});

describe('splitting and joining the draft', () => {
  it('splits into the questions a student reads and the key, leaving unanswered questions out of the key', () => {
    const { questions, answers } = splitDraft([question('a', 'single', ['aa']), question('b', 'single', [])]);
    expect(questions.every((q) => !('correct' in q))).toBe(true);
    expect(answers).toEqual({ a: ['aa'] });
  });

  it('joins them back, giving a question with no key entry an empty answer', () => {
    const { questions, answers } = splitDraft([question('a', 'single', ['aa']), question('b', 'single', [])]);
    expect(joinDraft(questions, answers).map((q) => q.correct)).toEqual([['aa'], []]);
    expect(joinDraft(questions, undefined).map((q) => q.correct)).toEqual([[], []]);
  });

  it('copies the saved questions so editing the draft never changes them', () => {
    const { questions } = splitDraft([question('a', 'single', [])]);
    const joined = joinDraft(questions, {});
    joined[0].options[0].text = 'edited';
    expect(questions[0].options[0].text).toBe('A');
  });
});

describe('comparing keys and drafts', () => {
  it('treats the same options in another order as the same key', () => {
    expect(sameAnswers({ a: ['x', 'y'] }, { a: ['y', 'x'] })).toBe(true);
    expect(sameAnswers({ a: ['x'] }, { a: ['y'] })).toBe(false);
    expect(sameAnswers({ a: ['x'] }, {})).toBe(false);
    expect(sameAnswers(undefined, {})).toBe(true);
  });

  it('notices a change to the text, the options, the points or the answers', () => {
    const base = [question('a', 'single', ['aa'])];
    const { questions, answers } = splitDraft(base);
    expect(draftChanged(base, joinDraft(questions, answers))).toBe(false);
    expect(draftChanged(base, [{ ...base[0], text: 'New' }])).toBe(true);
    expect(draftChanged(base, [{ ...base[0], points: 2 }])).toBe(true);
    expect(draftChanged(base, [{ ...base[0], correct: ['ab'] }])).toBe(true);
    expect(draftChanged(base, [])).toBe(true);
  });
});

describe('groupIssues', () => {
  it('groups the issues by question and keeps the exam-wide ones apart', () => {
    const q = question('a', 'single', []);
    const issues = [...validateQuestions([], 'single'), ...validateKey([q], {})];
    const { byQuestion, general } = groupIssues(issues);
    expect(general.map((i) => i.code)).toContain('no_questions');
    expect(byQuestion.a.map((i) => i.code)).toEqual(['key_missing']);
  });
});

describe('editMode', () => {
  const T = 1_800_000_000_000;
  const quiet = { hasAttempts: false, nowMs: T };

  it('allows everything in a draft, whatever the clock says', () => {
    expect(editMode({ status: 'draft', opensAtMs: T - 1000 }, quiet)).toBe('full');
    expect(editMode({}, quiet)).toBe('full');
  });

  it('allows everything in a published exam before it opens and while nobody has started', () => {
    expect(editMode({ status: 'published', opensAtMs: T + 1 }, quiet)).toBe('full');
  });

  it('allows only key corrections once the window has opened, an attempt exists, or the exam is closed', () => {
    expect(editMode({ status: 'published', opensAtMs: T }, quiet)).toBe('key_only');
    expect(editMode({ status: 'published', opensAtMs: T + 1 }, { hasAttempts: true, nowMs: T })).toBe('key_only');
    expect(editMode({ status: 'closed', opensAtMs: T + 1 }, quiet)).toBe('key_only');
  });

  it('allows nothing in a finalized exam', () => {
    expect(editMode({ status: 'finalized' }, quiet)).toBe('read_only');
  });
});

describe('nextKeyRevision', () => {
  it('goes up only when the answers were corrected in key-only mode', () => {
    expect(nextKeyRevision(1, 'key_only', true)).toBe(2);
    expect(nextKeyRevision(3, 'key_only', true)).toBe(4);
    expect(nextKeyRevision(2, 'key_only', false)).toBe(2);
    expect(nextKeyRevision(2, 'full', true)).toBe(2);
    expect(nextKeyRevision(undefined, 'full', false)).toBe(1);
  });
});

describe('applyKeyCorrections', () => {
  it('takes only the correct options from the edited list and keeps the saved questions as they were', () => {
    const saved = [question('a', 'single', ['aa']), question('b', 'single', ['ba'])];
    const edited = [
      { ...saved[0], text: 'Changed text', correct: ['ab'] },
      { ...saved[1], points: 9 },
    ];
    const out = applyKeyCorrections(saved, edited);
    expect(out[0].text).toBe('Question a');
    expect(out[0].correct).toEqual(['ab']);
    expect(out[1].points).toBe(1);
    expect(out[1].correct).toEqual(['ba']);
  });

  it('ignores a question that is not in the saved list', () => {
    const saved = [question('a', 'single', ['aa'])];
    const out = applyKeyCorrections(saved, [question('z', 'single', ['za'])]);
    expect(out).toHaveLength(1);
    expect(out[0].correct).toEqual(['aa']);
  });
});

describe('contentCounts', () => {
  it('counts the questions and adds up the points', () => {
    expect(contentCounts([question('a', 'single', [], { points: 1.5 }), question('b', 'single', [], { points: 2 })])).toEqual({
      questionCount: 2,
      totalPoints: 3.5,
    });
    expect(contentCounts([])).toEqual({ questionCount: 0, totalPoints: 0 });
  });
});
