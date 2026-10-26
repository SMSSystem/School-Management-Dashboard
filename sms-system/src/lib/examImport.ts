import { EXAM_LIMITS, type ExamAnswerMode, type ExamQuestionKind } from '@/types/exams';
import { defaultKind, newId, type BuilderQuestion } from './examBuilderLogic';
import { defaultRng, type Rng } from './examShuffle';
import type { ImportImage, ImportPicture } from './examImportPictures';
import type { RawRow } from './spreadsheetImport';

// Turning the rows of the exam spreadsheet template into builder questions
// (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4). One row per question: `Question`, an optional `Type`
// (`single` or `multiple`), `Option A` to `Option F`, `Correct` (letters) and optional `Points`. The questions
// open in the builder for review; nothing is saved by the import. Cell text is treated as plain text only. Pure
// and Firebase-free (the file reading and the template download are in the page code).

export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export const EXAM_IMPORT_HEADERS = [
  'Question',
  'Type',
  ...OPTION_LETTERS.map((l) => `Option ${l}`),
  'Correct',
  'Points',
] as const;

// The columns a file must have; the others may be left out.
const REQUIRED_HEADERS = ['Question', 'Option A', 'Option B', 'Correct'] as const;

/** A thing to check after an import: a spreadsheet `row`, or a `question` number in a Word or PDF file. */
export type ImportWarning = { row?: number; question?: number; message: string };

/** "Row 4: " or "Question 3: " (nothing for a warning about the whole file). */
export function warningPrefix(w: ImportWarning): string {
  if (w.row) return `Row ${w.row}: `;
  if (w.question) return `Question ${w.question}: `;
  return '';
}

export type ImportResult = {
  questions: BuilderQuestion[];
  warnings: ImportWarning[];
  /** Required columns the file does not have; when any are missing nothing is read. */
  missingHeaders: string[];
  /** Only for a document that held pictures: where each picture stands, and the pictures themselves (by the same index). */
  images?: ImportImage[];
  pictures?: ImportPicture[];
};

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Imported text without control characters (other than tab and line breaks) and without the characters that reverse the
 * direction of text, which a crafted file can use to make one thing read as another.
 */
export function cleanImportedText(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    const control = (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f || (code >= 0x80 && code < 0xa0);
    const bidi = (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
    if (!control && !bidi) out += ch;
  }
  return out;
}

const textOf = (value: string | number | null | undefined): string =>
  value === null || value === undefined ? '' : cleanImportedText(String(value)).trim();

/** The text cut to `max` characters, with a warning when it was cut (the builder would refuse it at that length). */
function clipped(text: string, max: number, warn: (message: string) => void, what: string): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  warn(`The ${what} was longer than ${max} characters, so it was cut. Check it.`);
  return chars.slice(0, max).join('').trimEnd();
}

const isHalfStep = (n: number) => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;

/** The option letters in a `Correct` cell: `B`, `A,C`, `A;C`, `A C` and `AC` all work; anything else is reported. */
export function parseCorrectLetters(raw: string): { letters: string[]; unreadable: string[] } {
  const letters: string[] = [];
  const unreadable: string[] = [];
  for (const token of raw.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)) {
    if (token === 'AND') continue;
    if (/^[A-F]+$/.test(token)) {
      for (const letter of token) if (!letters.includes(letter)) letters.push(letter);
    } else {
      unreadable.push(token);
    }
  }
  return { letters, unreadable };
}

/**
 * Reads the template's rows. Blank rows are skipped, a row without question text is skipped with a warning, and
 * everything else becomes a question, with a warning for what the teacher should look at (fewer than two options,
 * no answer, an answer letter with no option, a type that disagrees with the answers, bad points).
 */
export function questionsFromRows(
  rows: readonly RawRow[],
  answerMode: ExamAnswerMode | undefined,
  rng: Rng = defaultRng(),
): ImportResult {
  const { questions, warnings, missingHeaders } = questionsWithSources(rows, answerMode, rng);
  return { questions, warnings, missingHeaders };
}

/** As questionsFromRows, and for each question made, the index of the row it came from (a skipped row makes none). */
export function questionsWithSources(
  rows: readonly RawRow[],
  answerMode: ExamAnswerMode | undefined,
  rng: Rng = defaultRng(),
): ImportResult & { sourceRows: number[] } {
  const warnings: ImportWarning[] = [];
  const sourceRows: number[] = [];
  if (rows.length === 0) {
    return { questions: [], warnings: [{ message: 'The file has no rows. Use the template and keep its header row.' }], missingHeaders: [], sourceRows };
  }

  // The file's own spelling of each header, matched without regard to case or extra spaces.
  const keyByHeader = new Map<string, string>();
  for (const key of Object.keys(rows[0])) keyByHeader.set(norm(key), key);
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !keyByHeader.has(norm(h)));
  if (missingHeaders.length > 0) return { questions: [], warnings, missingHeaders: [...missingHeaders], sourceRows };
  const cell = (row: RawRow, header: string): string => {
    const key = keyByHeader.get(norm(header));
    return key === undefined ? '' : textOf(row[key]);
  };

  const questions: BuilderQuestion[] = [];
  let truncated = false;
  rows.forEach((row, index) => {
    const n = index + 2; // the spreadsheet row: the header is row 1
    const cells = [...keyByHeader.values()].map((key) => textOf(row[key]));
    if (cells.every((c) => c === '')) return;
    if (questions.length >= EXAM_LIMITS.maxQuestions) {
      truncated = true;
      return;
    }

    const text = clipped(cell(row, 'Question'), EXAM_LIMITS.questionTextMax, (message) => warnings.push({ row: n, message }), 'question');
    if (!text) {
      warnings.push({ row: n, message: 'There is no question text, so the row was skipped.' });
      return;
    }

    const options = OPTION_LETTERS.flatMap((letter) => {
      const optionText = clipped(cell(row, `Option ${letter}`), EXAM_LIMITS.optionTextMax, (message) => warnings.push({ row: n, message }), `text of option ${letter}`);
      return optionText ? [{ letter, id: newId('o', rng), text: optionText }] : [];
    });
    if (options.length < EXAM_LIMITS.minOptions) {
      warnings.push({ row: n, message: `The question has ${options.length} option${options.length === 1 ? '' : 's'}; it needs at least ${EXAM_LIMITS.minOptions}.` });
    }

    const { letters, unreadable } = parseCorrectLetters(cell(row, 'Correct'));
    if (unreadable.length > 0) {
      warnings.push({ row: n, message: `Could not read "${unreadable.join('", "')}" in Correct. Use option letters such as B or A,C.` });
    }
    const correct: string[] = [];
    for (const letter of letters) {
      const option = options.find((o) => o.letter === letter);
      if (option) correct.push(option.id);
      else warnings.push({ row: n, message: `The answer ${letter} has no matching option, so it was left out of the key.` });
    }
    if (correct.length === 0) warnings.push({ row: n, message: 'No correct answer is given, so the key is incomplete for this question.' });

    const typeCell = cell(row, 'Type').toLowerCase();
    let kind: ExamQuestionKind;
    if (typeCell === 'single' || typeCell === 'multiple') {
      kind = typeCell;
      if ((kind === 'single' && correct.length > 1) || (kind === 'multiple' && correct.length === 1)) {
        warnings.push({ row: n, message: `The type says ${kind} but ${correct.length} answer${correct.length === 1 ? ' is' : 's are'} given.` });
      }
    } else {
      if (typeCell) warnings.push({ row: n, message: `The type "${cell(row, 'Type')}" is not single or multiple, so it was worked out from the answers.` });
      kind = correct.length >= 2 ? 'multiple' : correct.length === 1 ? 'single' : defaultKind(answerMode);
    }

    let points = 1;
    const pointsCell = cell(row, 'Points');
    if (pointsCell) {
      const value = Number(pointsCell);
      if (Number.isFinite(value) && value >= EXAM_LIMITS.minPoints && value <= EXAM_LIMITS.maxPoints && isHalfStep(value)) points = value;
      else warnings.push({ row: n, message: `The points "${pointsCell}" are not from ${EXAM_LIMITS.minPoints} to ${EXAM_LIMITS.maxPoints} in steps of ${EXAM_LIMITS.pointsStep}, so 1 was used.` });
    }

    sourceRows.push(index);
    questions.push({
      id: newId('q', rng),
      text,
      kind,
      options: options.map(({ id, text: optionText }) => ({ id, text: optionText })),
      points,
      correct,
    });
  });

  if (truncated) {
    warnings.push({ message: `Only the first ${EXAM_LIMITS.maxQuestions} questions were read; an exam can have at most ${EXAM_LIMITS.maxQuestions}.` });
  }
  if (questions.length === 0 && warnings.length === 0) warnings.push({ message: 'No questions were found in the file.' });
  return { questions, warnings, missingHeaders: [], sourceRows };
}

/**
 * Puts imported questions into the builder's list: either they replace it, or they go on the end. Whatever does
 * not fit under the question limit is dropped and counted.
 */
export function mergeImported(
  existing: readonly BuilderQuestion[],
  imported: readonly BuilderQuestion[],
  mode: 'replace' | 'append',
): { questions: BuilderQuestion[]; dropped: number } {
  const combined = mode === 'replace' ? [...imported] : [...existing, ...imported];
  const questions = combined.slice(0, EXAM_LIMITS.maxQuestions);
  return { questions, dropped: combined.length - questions.length };
}

/** Three worked examples for the downloadable template, keyed by header. */
export function examTemplateRows(): Record<string, string | number>[] {
  const row = (r: Record<string, string | number>) => Object.fromEntries(EXAM_IMPORT_HEADERS.map((h) => [h, r[h] ?? '']));
  return [
    row({
      Question: 'Which planet is known as the Red Planet?',
      Type: 'single',
      'Option A': 'Venus',
      'Option B': 'Mars',
      'Option C': 'Jupiter',
      'Option D': 'Mercury',
      Correct: 'B',
      Points: 1,
    }),
    row({
      Question: 'Which of these are prime numbers?',
      Type: 'multiple',
      'Option A': '2',
      'Option B': '4',
      'Option C': '7',
      'Option D': '9',
      Correct: 'A,C',
      Points: 2,
    }),
    row({
      Question: 'Water boils at 100 degrees Celsius at sea level.',
      'Option A': 'True',
      'Option B': 'False',
      Correct: 'A',
    }),
  ];
}
