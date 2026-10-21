import { describe, expect, it } from 'vitest';
import { questionsFromLines } from '../examDocumentText';
import { examTemplateRows, questionsFromRows, warningPrefix } from '../examImport';
import { validateKey, validateQuestions } from '../examKeyValidation';
import { splitDraft, type BuilderQuestion } from '../examBuilderLogic';
import { EXAM_LIMITS } from '@/types/exams';
import type { RawRow } from '../spreadsheetImport';

// Reading the lines of a Word or PDF document by the fixed layout (EXAMS_FEATURE_SPEC.md §4.4).

const read = (lines: string[], mode: 'single' | 'multiple' | 'both' = 'both') => questionsFromLines(lines, mode);
const texts = (q: BuilderQuestion) => q.options.map((o) => o.text);
const correct = (q: BuilderQuestion) => q.options.filter((o) => q.correct.includes(o.id)).map((o) => o.text);

const LAYOUT = [
  '1. Which planet is known as the Red Planet?',
  'A. Venus',
  'B. Mars',
  'C. Jupiter',
  'D. Mercury',
  'Answer: B',
  '',
  '2. Which of these are prime numbers? [2 marks]',
  'A) 2',
  'B) 4',
  'C) 7',
  'D) 9',
  'Answers: A, C',
  '',
  '3) Water boils at 100 degrees Celsius at sea level.',
  '(A) True',
  '(B) False',
  'Answer: A',
];

describe('the fixed layout', () => {
  it('reads numbered questions, lettered options, answers and points', () => {
    const { questions, warnings } = read(LAYOUT);
    expect(warnings).toEqual([]);
    expect(questions).toHaveLength(3);
    expect(questions[0].text).toBe('Which planet is known as the Red Planet?');
    expect(texts(questions[0])).toEqual(['Venus', 'Mars', 'Jupiter', 'Mercury']);
    expect(correct(questions[0])).toEqual(['Mars']);
    expect(questions[1].kind).toBe('multiple');
    expect(correct(questions[1])).toEqual(['2', '7']);
    expect(questions[1].points).toBe(2);
    expect(questions[1].text).toBe('Which of these are prime numbers?');
    expect(questions[2].kind).toBe('single');
    expect(questions[2].points).toBe(1);
  });

  it('gives the same questions as the spreadsheet template’s examples', () => {
    const fromSheet = questionsFromRows(examTemplateRows() as RawRow[], 'both').questions;
    const fromDoc = read([
      '1. Which planet is known as the Red Planet?',
      'A. Venus', 'B. Mars', 'C. Jupiter', 'D. Mercury', 'Answer: B',
      '2. Which of these are prime numbers? [2 marks]',
      'A. 2', 'B. 4', 'C. 7', 'D. 9', 'Answers: A, C',
      '3. Water boils at 100 degrees Celsius at sea level.',
      'A. True', 'B. False', 'Answer: A',
    ]).questions;
    const strip = (qs: BuilderQuestion[]) => qs.map((q) => ({ text: q.text, kind: q.kind, points: q.points, options: texts(q), correct: correct(q) }));
    expect(strip(fromDoc)).toEqual(strip(fromSheet));
  });

  it('gives questions that pass the builder checks', () => {
    const { questions } = read(LAYOUT);
    const { questions: items, answers } = splitDraft(questions);
    expect(validateQuestions(items, 'both')).toEqual([]);
    expect(validateKey(items, answers)).toEqual([]);
  });

  it('accepts Q1., 1), upper and lower case letters, and round brackets', () => {
    const { questions, warnings } = read(['Q1. First?', 'a) one', '(b) two', 'Answer: b', '2) Second?', '(A) x', '(B) y', 'Answer: A']);
    expect(warnings).toEqual([]);
    expect(questions.map((q) => q.text)).toEqual(['First?', 'Second?']);
    expect(correct(questions[0])).toEqual(['two']);
  });

  it('accepts the answer written several ways', () => {
    const answer = (line: string) => {
      const { questions, warnings } = read(['1. Q?', 'A. a', 'B. b', 'C. c', line]);
      return { texts: correct(questions[0]), warnings };
    };
    expect(answer('Answer: B').texts).toEqual(['b']);
    expect(answer('Answers: A, C').texts).toEqual(['a', 'c']);
    expect(answer('Ans = c').texts).toEqual(['c']);
    expect(answer('Correct answer: A and C').texts).toEqual(['a', 'c']);
    expect(answer('Answer – B').texts).toEqual(['b']);
    expect(answer('Answer: B. b').texts).toEqual(['b']);
    expect(answer('Answer: (C)').texts).toEqual(['c']);
    expect(answer('Answer: B (because it is b)').warnings).toEqual([]);
  });
});

describe('points', () => {
  it('reads [2 marks], (1 point) and [3 pts] from any line of the question and removes them from the text', () => {
    const { questions } = read(['1. First? (1 point)', 'A. a', 'B. b', 'Answer: A', '2. Second?', 'A. a', 'B. b', 'Answer: B [3 pts]', '3. Third? [2.5 marks]', 'A. a', 'B. b', 'Answer: A']);
    expect(questions.map((q) => q.points)).toEqual([1, 3, 2.5]);
    expect(questions[0].text).toBe('First?');
    expect(questions[2].text).toBe('Third?');
  });

  it('warns about points outside 0.5 to 100 in half steps and uses 1', () => {
    const { questions, warnings } = read(['1. Q? [0.3 marks]', 'A. a', 'B. b', 'Answer: A']);
    expect(questions[0].points).toBe(1);
    expect(warnings[0].question).toBe(1);
  });
});

describe('lines that wrap', () => {
  it('joins a stem that continues on the next lines', () => {
    const { questions } = read(['1. Read the passage carefully and', 'say what the writer means by', '"home".', 'A. a place', 'B. a feeling', 'Answer: B']);
    expect(questions[0].text).toBe('Read the passage carefully and say what the writer means by "home".');
  });

  it('joins an option that continues on the next line', () => {
    const { questions } = read(['1. Q?', 'A. a very long first option that', 'carries on here', 'B. short', 'Answer: A']);
    expect(texts(questions[0])).toEqual(['a very long first option that carries on here', 'short']);
  });

  it('does not take a decimal or a repeated letter for a new question or option', () => {
    const { questions } = read(['1. How many litres is', '2.5 litres of milk in millilitres?', 'A. 250', 'B. 2500', 'A. Smith says so', 'Answer: B']);
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe('How many litres is 2.5 litres of milk in millilitres?');
    expect(texts(questions[0])).toEqual(['250', '2500 A. Smith says so']);
  });

  it('ignores blank lines and extra spaces', () => {
    const { questions } = read(['', '  1.   Spaced   out?  ', '', ' A.  one ', '', 'B.   two', '', ' Answer :  A ']);
    expect(questions[0].text).toBe('Spaced out?');
    expect(texts(questions[0])).toEqual(['one', 'two']);
    expect(correct(questions[0])).toEqual(['one']);
  });
});

describe('what it reports', () => {
  it('counts the lines before the first question as ignored', () => {
    const { warnings, questions } = read(['Unit 3 Test', 'Time allowed: 45 minutes', '', '1. Q?', 'A. a', 'B. b', 'Answer: A']);
    expect(questions).toHaveLength(1);
    expect(warnings).toEqual([{ message: '2 lines before the first question (a title or instructions) were ignored.' }]);
    expect(read(['Title', '1. Q?', 'A. a', 'B. b', 'Answer: A']).warnings[0].message).toContain('1 line before the first question');
  });

  it('names the question for the usual problems', () => {
    const { warnings } = read(['1. Fine?', 'A. a', 'B. b', 'Answer: A', '2. No answer?', 'A. a', 'B. b', '3. One option?', 'A. only', 'Answer: A', '4. Wrong letter?', 'A. a', 'B. b', 'Answer: E']);
    const text = warnings.map((w) => `${warningPrefix(w)}${w.message}`);
    expect(text).toContain('Question 2: No correct answer is given, so the key is incomplete for this question.');
    expect(text).toContain('Question 3: The question has 1 option; it needs at least 2.');
    expect(text.some((t) => t.startsWith('Question 4: ') && t.includes('E'))).toBe(true);
    expect(warnings.every((w) => w.row === undefined)).toBe(true);
  });

  it('lists the warnings in the order of the questions', () => {
    const { warnings } = read(['x', '1. Q?', 'A. a', 'B. b', '2. R?', 'A. a', 'B. b']);
    expect(warnings.map((w) => w.question)).toEqual([undefined, 1, 2]);
  });

  it('says text after the answer line was ignored, rather than adding it to an option', () => {
    const { questions, warnings } = read(['1. Q?', 'A. a', 'B. b', 'Answer: A', 'Explanation: because a.']);
    expect(texts(questions[0])).toEqual(['a', 'b']);
    expect(warnings).toEqual([{ question: 1, message: 'Text after the answer line was ignored.' }]);
  });

  it('says how to lay a file out when it finds no question', () => {
    const { questions, warnings } = read(['Just some text', 'with no numbers']);
    expect(questions).toEqual([]);
    expect(warnings[0].message).toContain('No questions were found');
    expect(read([]).warnings[0].message).toContain('No questions were found');
  });

  it('reads only the first 100 questions and says so', () => {
    const lines = Array.from({ length: 120 }, (_, i) => [`${i + 1}. Question ${i + 1}?`, 'A. a', 'B. b', 'Answer: A']).flat();
    const { questions, warnings } = read(lines);
    expect(questions).toHaveLength(EXAM_LIMITS.maxQuestions);
    expect(warnings.some((w) => w.message.includes('first 100 questions'))).toBe(true);
  });

  it('uses the answer mode for a question with no answer, as the spreadsheet import does', () => {
    expect(read(['1. Q?', 'A. a', 'B. b'], 'multiple').questions[0].kind).toBe('multiple');
  });
});

describe('plain text only', () => {
  it('keeps markup-looking text as text', () => {
    const { questions } = read(['1. <b>Bold?</b>', 'A. <script>alert(1)</script>', 'B. =1+1', 'Answer: A']);
    expect(questions[0].text).toBe('<b>Bold?</b>');
    expect(texts(questions[0])).toEqual(['<script>alert(1)</script>', '=1+1']);
  });
});
