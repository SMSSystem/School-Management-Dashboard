import type { ExamAnswerMode } from '@/types/exams';
import { DocxError, readDocxLines } from './docxText';
import { questionsFromLines } from './examDocumentText';
import type { ImportResult } from './examImport';

// Reading questions from a Word (.docx) file chosen in the import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.4). Loaded only when a Word file is chosen, so the zip reader is in no other chunk. The file is read in the browser
// and forgotten; the questions open in the builder for review.

/** Turns a Word file's bytes into questions and warnings; what the file left out (tables, text boxes) is among the warnings. */
export function questionsFromDocx(bytes: Uint8Array, answerMode: ExamAnswerMode | undefined): ImportResult {
  const { lines, notes } = readDocxLines(bytes);
  const result = questionsFromLines(lines, answerMode);
  return { ...result, warnings: [...notes.map((message) => ({ message })), ...result.warnings] };
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
