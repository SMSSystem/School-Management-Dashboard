// The three example questions of the import templates (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): a single-answer
// question, a multiple-answer one with points, and a true-or-false one, in the layout the Word, PDF and Markdown readers
// expect. The Word, PDF and Markdown templates are all made from these lines. No library is imported here.

/** The lines of the example, in order. A blank string is an empty line between questions. */
export const EXAMPLE_PARAGRAPHS: readonly string[] = [
  '1. Which planet is known as the Red Planet?',
  'A. Venus',
  'B. Mars',
  'C. Jupiter',
  'D. Mercury',
  'Answer: B',
  '',
  '2. Which of these are prime numbers? [2 marks]',
  'A. 2',
  'B. 4',
  'C. 7',
  'D. 9',
  'Answers: A, C',
  '',
  '3. Water boils at 100 degrees Celsius at sea level.',
  'A. True',
  'B. False',
  'Answer: A',
];
