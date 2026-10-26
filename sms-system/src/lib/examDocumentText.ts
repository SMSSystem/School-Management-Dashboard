import type { ExamAnswerMode } from '@/types/exams';
import { questionsWithSources, type ImportResult } from './examImport';
import { pictureIndexOf, type ImportImage } from './examImportPictures';
import type { RawRow } from './spreadsheetImport';

// Turning the lines of a Word or PDF document into builder questions (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.4). Both readers hand over the same thing — lines of plain text, one per paragraph or per printed line — and this
// reads them by a fixed layout:
//
//   1. What is 2 + 2?   [2 marks]          a question starts with a number and a dot or bracket
//   A. 3                                    its options follow, A. or A) or (A), one per line
//   B. 4
//   Answer: B                               the right option(s): Answer: B  or  Answers: A, C
//
// A line that starts none of those continues the line before it (a printed line wraps). Points are written
// [2 marks] or (1 point) anywhere on a question's lines. Text before the first question (a title, instructions) is
// ignored and reported. The questions are checked by the same code as the spreadsheet import, so a question with fewer
// than two options or no answer gets the same warning. A line that marks a picture (the Word reader writes one where a
// picture stands, docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.1) is not text: it goes to the question
// being read, `clear` when it stands after the question's text and before its first option, `check` anywhere else in the
// question, and to no question when it comes before the first. Pure and Firebase-free.

const QUESTION_START = /^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.)](?:\s+(.*))?$/i;
const OPTION_START = /^\(?([A-Fa-f])\s*[.)](?:\s+(.*))?$/;
const ANSWER_LINE = /^(?:answers?|ans|correct(?:\s+answers?)?)\s*[:=\-–—]\s*(.*)$/i;
const POINTS = /[[(]\s*(\d+(?:\.\d+)?)\s*(?:marks?|points?|pts?)\s*[\])]/i;
const LETTER_LIST = /^\(?\s*([A-F](?:[\s,;/&]*(?:and\s+)?[A-F])*)\s*\)?(?![A-Za-z])/i;

type Draft = {
  stem: string[];
  options: { letter: string; text: string }[];
  answer: string | null;
  points: string | null;
  afterAnswer: boolean;
  ignoredAfterAnswer: boolean;
  /** How many pictures have been put on this question. */
  pictures: number;
};

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

const emptyDraft = (): Draft => ({ stem: [], options: [], answer: null, points: null, afterAnswer: false, ignoredAfterAnswer: false, pictures: 0 });

const rowOf = (d: Draft): RawRow => {
  const row: RawRow = { Question: tidy(d.stem.join(' ')), Correct: d.answer, Points: d.points };
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) row[`Option ${letter}`] = null;
  for (const o of d.options) row[`Option ${o.letter}`] = tidy(o.text) || null;
  return row;
};

/** The letters of an answer line ("B", "A, C", "B. Paris"); the whole value if it is not a list of letters. */
function answerValue(value: string): string {
  const m = LETTER_LIST.exec(value.trim());
  return m ? m[1] : value.trim();
}

/**
 * Reads the lines and returns the questions, with a warning for each thing to check. `missingHeaders` is always empty
 * (there are no columns). Warnings name the question ("Question 3"); those about the whole file name nothing.
 */
export function questionsFromLines(lines: readonly string[], answerMode: ExamAnswerMode | undefined): ImportResult {
  const drafts: Draft[] = [];
  const warnings: ImportResult['warnings'] = [];
  let current: Draft | null = null;
  let before = 0;
  // Where each picture stands, by the index of the draft that holds it (null: no question yet).
  const placed: { index: number; draft: number | null; confidence: ImportImage['confidence'] }[] = [];

  const note = (index: number, message: string) => warnings.push({ question: index + 1, message });

  for (const raw of lines) {
    let line = raw.trim();
    if (line === '') continue;

    const pictureIndex = pictureIndexOf(line);
    if (pictureIndex !== null) {
      if (!current) {
        placed.push({ index: pictureIndex, draft: null, confidence: 'unassigned' });
      } else {
        const clear = current.options.length === 0 && !current.afterAnswer && current.pictures === 0;
        placed.push({ index: pictureIndex, draft: drafts.length - 1, confidence: clear ? 'clear' : 'check' });
        current.pictures += 1;
      }
      continue;
    }

    const pointsMatch = POINTS.exec(line);
    const linePoints = pointsMatch ? pointsMatch[1] : null;
    if (pointsMatch) line = tidy(line.replace(POINTS, ' '));
    if (line === '' && !current) continue;

    const start = QUESTION_START.exec(line);
    if (start) {
      current = emptyDraft();
      drafts.push(current);
      current.stem.push(start[2] ?? '');
      if (linePoints) current.points = linePoints;
      continue;
    }
    if (!current) {
      before += 1;
      continue;
    }
    if (linePoints && current.points === null) current.points = linePoints;

    const answer = ANSWER_LINE.exec(line);
    if (answer) {
      current.answer = answerValue(answer[1]);
      current.afterAnswer = true;
      continue;
    }
    const option = OPTION_START.exec(line);
    if (option && !current.afterAnswer && !current.options.some((o) => o.letter === option[1].toUpperCase())) {
      current.options.push({ letter: option[1].toUpperCase(), text: option[2] ?? '' });
      continue;
    }
    if (current.afterAnswer) {
      current.ignoredAfterAnswer = true;
      continue;
    }
    if (current.options.length > 0) current.options[current.options.length - 1].text += ` ${line}`;
    else current.stem.push(line);
  }

  if (drafts.length === 0) {
    return {
      questions: [],
      warnings: [
        {
          message:
            'No questions were found. Start each question with a number and a dot (1. or 1)), put each option on its own line starting A. B. C. …, and give the answer as "Answer: B".',
        },
      ],
      missingHeaders: [],
      ...(placed.length > 0 && { images: placed.map(({ index }): ImportImage => ({ index, questionIndex: null, confidence: 'unassigned' })) }),
    };
  }

  const result = questionsWithSources(drafts.map(rowOf), answerMode);
  // The shared checks speak of spreadsheet rows; a document has questions (the first row is the first question).
  const checks: ImportResult['warnings'] = result.warnings.map(({ row, message }) => (row ? { question: row - 1, message } : { message }));
  drafts.forEach((d, i) => {
    if (d.ignoredAfterAnswer) note(i, 'Text after the answer line was ignored.');
  });
  const lead: ImportResult['warnings'] = before > 0 ? [{ message: `${before} line${before === 1 ? '' : 's'} before the first question (a title or instructions) ${before === 1 ? 'was' : 'were'} ignored.` }] : [];
  const out: ImportResult = {
    questions: result.questions,
    warnings: [...lead, ...checks, ...warnings].sort((a, b) => (a.question ?? 0) - (b.question ?? 0)),
    missingHeaders: [],
  };
  if (placed.length > 0) {
    // A question left out (no text, or past the limit) has no place in the result: its pictures belong to none.
    out.images = placed
      .map(({ index, draft, confidence }): ImportImage => {
        const questionIndex = draft === null ? -1 : result.sourceRows.indexOf(draft);
        return questionIndex < 0 ? { index, questionIndex: null, confidence: 'unassigned' } : { index, questionIndex, confidence };
      })
      .sort((a, b) => a.index - b.index);
  }
  return out;
}
