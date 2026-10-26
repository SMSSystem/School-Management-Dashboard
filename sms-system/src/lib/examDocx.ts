import type { ExamAnswerMode } from '@/types/exams';
import { DocxError, readDocxLines } from './docxText';
import { questionsFromLines } from './examDocumentText';
import type { ImportResult } from './examImport';

// Reading questions from a Word (.docx) file chosen in the import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.4). Loaded only when a Word file is chosen, so the zip reader is in no other chunk. The file is read in the browser
// and forgotten; the questions open in the builder for review.

/** Turns a Word file's bytes into questions and warnings; what the file left out (tables, text boxes) is among the warnings. */
export function questionsFromDocx(bytes: Uint8Array, answerMode: ExamAnswerMode | undefined): ImportResult {
  const { lines, notes, pictures } = readDocxLines(bytes);
  // The lines that mark a picture are placed on the questions (images) and the pictures go with the result; the review
  // step that shows them is still to come, so until then the teacher is told they were found and not used.
  const result = questionsFromLines(lines, answerMode);
  const found = pictures.length > 0 ? [{ message: `${pictures.length} picture${pictures.length === 1 ? ' was' : 's were'} found in the file but ${pictures.length === 1 ? 'is' : 'are'} not placed on the questions yet; add ${pictures.length === 1 ? 'it' : 'them'} in the builder.` }] : [];
  return { ...result, warnings: [...notes.map((message) => ({ message })), ...found, ...result.warnings], ...(pictures.length > 0 && { pictures }) };
}

/** Reads a chosen .docx file. Throws an Error with a message for the teacher when it cannot be read. */
export async function readWordFile(file: File, answerMode: ExamAnswerMode | undefined): Promise<ImportResult> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new DocxError('That file could not be opened. Choose it again.');
  }
  return questionsFromDocx(bytes, answerMode);
}
