import { describe, expect, it } from 'vitest';
import { EXAM_IMPORT_HEADERS, examTemplateRows, mergeImported, parseCorrectLetters, questionsFromRows, warningPrefix } from '../examImport';
import { splitDraft, type BuilderQuestion } from '../examBuilderLogic';
import { seededRandom } from '../examShuffle';
import { validateKey, validateQuestions } from '../examKeyValidation';
import { EXAM_LIMITS } from '@/types/exams';
import type { RawRow } from '../spreadsheetImport';

// Reading the exam spreadsheet template (EXAMS_FEATURE_SPEC.md §4.4).

const read = (rows: RawRow[], mode: 'single' | 'multiple' | 'both' = 'both') => questionsFromRows(rows, mode, seededRandom(3));

const row = (r: Record<string, string | number | null>): RawRow => ({
  Question: null,
  Type: null,
  'Option A': null,
  'Option B': null,
  'Option C': null,
  'Option D': null,
  'Option E': null,
  'Option F': null,
  Correct: null,
  Points: null,
  ...r,
});

const optionTexts = (q: BuilderQuestion) => q.options.map((o) => o.text);
const correctTexts = (q: BuilderQuestion) => q.options.filter((o) => q.correct.includes(o.id)).map((o) => o.text);

describe('parseCorrectLetters', () => {
  it('reads one letter, a list, and a run of letters', () => {
    expect(parseCorrectLetters('B').letters).toEqual(['B']);
    expect(parseCorrectLetters('A,C').letters).toEqual(['A', 'C']);
    expect(parseCorrectLetters('a; c').letters).toEqual(['A', 'C']);
    expect(parseCorrectLetters('A C').letters).toEqual(['A', 'C']);
    expect(parseCorrectLetters('ACD').letters).toEqual(['A', 'C', 'D']);
    expect(parseCorrectLetters('A and C').letters).toEqual(['A', 'C']);
  });

  it('drops repeats and reports what it cannot read', () => {
    expect(parseCorrectLetters('A, A').letters).toEqual(['A']);
    expect(parseCorrectLetters('2').unreadable).toEqual(['2']);
    expect(parseCorrectLetters('G').unreadable).toEqual(['G']);
    expect(parseCorrectLetters('').letters).toEqual([]);
  });
});

describe('questionsFromRows', () => {
  it('reads the three template examples without a warning about the file', () => {
    const result = read(examTemplateRows() as RawRow[]);
    expect(result.missingHeaders).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.questions).toHaveLength(3);
    const [one, two, three] = result.questions;
    expect(one.kind).toBe('single');
    expect(correctTexts(one)).toEqual(['Mars']);
    expect(two.kind).toBe('multiple');
    expect(correctTexts(two)).toEqual(['2', '7']);
    expect(two.points).toBe(2);
    expect(three.kind).toBe('single');
    expect(three.points).toBe(1);
  });

  it('gives a read file that passes the builder checks', () => {
    const { questions } = read(examTemplateRows() as RawRow[]);
    const { questions: items, answers } = splitDraft(questions);
    expect(validateQuestions(items, 'both')).toEqual([]);
    expect(validateKey(items, answers)).toEqual([]);
  });

  it('works out the type from the answers when the Type column is blank or missing', () => {
    const rows = [
      row({ Question: 'One?', 'Option A': 'x', 'Option B': 'y', Correct: 'A' }),
      row({ Question: 'Two?', 'Option A': 'x', 'Option B': 'y', 'Option C': 'z', Correct: 'A,C' }),
    ];
    expect(read(rows).questions.map((q) => q.kind)).toEqual(['single', 'multiple']);
  });

  it('uses the answer mode for the kind of a question with no answer yet', () => {
    const rows = [row({ Question: 'Q?', 'Option A': 'x', 'Option B': 'y' })];
    expect(read(rows, 'multiple').questions[0].kind).toBe('multiple');
    expect(read(rows, 'single').questions[0].kind).toBe('single');
  });

  it('skips blank cells between options but keeps each letter pointing at its own option', () => {
    const rows = [row({ Question: 'Q?', 'Option A': 'first', 'Option C': 'third', 'Option D': 'fourth', Correct: 'C' })];
    const [q] = read(rows).questions;
    expect(optionTexts(q)).toEqual(['first', 'third', 'fourth']);
    expect(correctTexts(q)).toEqual(['third']);
  });

  it('matches headers without regard to case or spacing, and ignores extra columns', () => {
    const rows: RawRow[] = [
      { ' question ': 'Q?', 'OPTION  A': 'x', 'option b': 'y', correct: 'B', Notes: 'ignored' },
    ];
    const result = read(rows);
    expect(result.missingHeaders).toEqual([]);
    expect(optionTexts(result.questions[0])).toEqual(['x', 'y']);
  });

  it('reports missing required columns and reads nothing', () => {
    const result = read([{ Question: 'Q?', 'Option A': 'x' }]);
    expect(result.missingHeaders).toEqual(['Option B', 'Correct']);
    expect(result.questions).toEqual([]);
  });

  it('says so when the file has no rows', () => {
    const result = read([]);
    expect(result.questions).toEqual([]);
    expect(result.warnings[0].message).toContain('no rows');
  });

  it('skips blank rows quietly and rows without question text with a warning', () => {
    const rows = [
      row({ Question: 'First?', 'Option A': 'x', 'Option B': 'y', Correct: 'A' }),
      row({}),
      row({ 'Option A': 'x', 'Option B': 'y', Correct: 'A' }),
    ];
    const result = read(rows);
    expect(result.questions).toHaveLength(1);
    expect(result.warnings).toEqual([{ row: 4, message: 'There is no question text, so the row was skipped.' }]);
  });

  it('warns about too few options, a missing answer, and an answer letter with no option', () => {
    const rows = [
      row({ Question: 'A?', 'Option A': 'only', Correct: 'A' }),
      row({ Question: 'B?', 'Option A': 'x', 'Option B': 'y' }),
      row({ Question: 'C?', 'Option A': 'x', 'Option B': 'y', Correct: 'E' }),
    ];
    const result = read(rows);
    expect(result.questions).toHaveLength(3);
    const text = result.warnings.map((w) => `${w.row}: ${w.message}`);
    expect(text).toContain('2: The question has 1 option; it needs at least 2.');
    expect(text).toContain('3: No correct answer is given, so the key is incomplete for this question.');
    expect(text).toContain('4: The answer E has no matching option, so it was left out of the key.');
    expect(result.questions[2].correct).toEqual([]);
  });

  it('keeps a type that disagrees with the answers but warns, and warns about an unknown type', () => {
    const rows = [
      row({ Question: 'A?', Type: 'single', 'Option A': 'x', 'Option B': 'y', 'Option C': 'z', Correct: 'A,B' }),
      row({ Question: 'B?', Type: 'maybe', 'Option A': 'x', 'Option B': 'y', Correct: 'A' }),
    ];
    const result = read(rows);
    expect(result.questions[0].kind).toBe('single');
    expect(result.questions[1].kind).toBe('single');
    expect(result.warnings.map((w) => w.message)).toEqual([
      'The type says single but 2 answers are given.',
      'The type "maybe" is not single or multiple, so it was worked out from the answers.',
    ]);
  });

  it('reads points, and uses 1 with a warning for bad ones', () => {
    const rows = [
      row({ Question: 'A?', 'Option A': 'x', 'Option B': 'y', Correct: 'A', Points: 2.5 }),
      row({ Question: 'B?', 'Option A': 'x', 'Option B': 'y', Correct: 'A', Points: '0.3' }),
      row({ Question: 'C?', 'Option A': 'x', 'Option B': 'y', Correct: 'A', Points: 'lots' }),
      row({ Question: 'D?', 'Option A': 'x', 'Option B': 'y', Correct: 'A', Points: 101 }),
    ];
    const result = read(rows);
    expect(result.questions.map((q) => q.points)).toEqual([2.5, 1, 1, 1]);
    expect(result.warnings).toHaveLength(3);
  });

  it('reads only the first 100 questions and says so', () => {
    const rows = Array.from({ length: 120 }, (_, i) => row({ Question: `Q${i}?`, 'Option A': 'x', 'Option B': 'y', Correct: 'A' }));
    const result = read(rows);
    expect(result.questions).toHaveLength(EXAM_LIMITS.maxQuestions);
    expect(result.warnings[result.warnings.length - 1].message).toContain('first 100 questions');
  });

  it('treats cell text as plain text and gives every question and option its own id', () => {
    const rows = [row({ Question: '<script>alert(1)</script>', 'Option A': '=1+1', 'Option B': 'y', Correct: 'A' })];
    const [q] = read(rows).questions;
    expect(q.text).toBe('<script>alert(1)</script>');
    expect(q.options[0].text).toBe('=1+1');
    expect(new Set(q.options.map((o) => o.id)).size).toBe(2);
  });

  it('reads numbers in cells as text', () => {
    const rows = [row({ Question: 'Sum?', 'Option A': 4, 'Option B': 5, Correct: 'A' })];
    expect(optionTexts(read(rows).questions[0])).toEqual(['4', '5']);
  });
});

describe('examTemplateRows', () => {
  it('has every header in order on every example', () => {
    for (const r of examTemplateRows()) expect(Object.keys(r)).toEqual([...EXAM_IMPORT_HEADERS]);
  });
});

describe('mergeImported', () => {
  const make = (n: number, prefix: string): BuilderQuestion[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `${prefix}${i}`,
      text: 't',
      kind: 'single' as const,
      options: [
        { id: 'a', text: 'a' },
        { id: 'b', text: 'b' },
      ],
      points: 1,
      correct: [],
    }));

  it('replaces the list or adds to the end', () => {
    expect(mergeImported(make(2, 'e'), make(3, 'i'), 'replace').questions.map((q) => q.id)).toEqual(['i0', 'i1', 'i2']);
    expect(mergeImported(make(2, 'e'), make(1, 'i'), 'append').questions.map((q) => q.id)).toEqual(['e0', 'e1', 'i0']);
  });

  it('keeps the list within 100 questions and counts what was dropped', () => {
    const out = mergeImported(make(95, 'e'), make(10, 'i'), 'append');
    expect(out.questions).toHaveLength(100);
    expect(out.dropped).toBe(5);
    expect(mergeImported(make(95, 'e'), make(10, 'i'), 'replace').dropped).toBe(0);
  });
});

describe('warningPrefix', () => {
  it('names a spreadsheet row, a question in a document, or nothing', () => {
    expect(warningPrefix({ row: 4, message: 'x' })).toBe('Row 4: ');
    expect(warningPrefix({ question: 3, message: 'x' })).toBe('Question 3: ');
    expect(warningPrefix({ message: 'x' })).toBe('');
  });
});
