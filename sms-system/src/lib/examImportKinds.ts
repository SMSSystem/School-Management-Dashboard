// Which kinds of file the exam import takes, and the limits on each (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4).
// Deliberately light: the import dialog checks a chosen file here before it loads the reader for that kind, and the
// readers (the spreadsheet library, the zip reader, pdf.js) are each their own lazily loaded chunk.

export type ImportKind = 'sheet' | 'word' | 'pdf' | 'markdown';

/** A spreadsheet of 100 questions is a few hundred kilobytes at most. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
/** A Markdown file can carry pictures as base64 text, a third larger than the pictures themselves. */
export const MAX_MARKDOWN_BYTES = 25 * 1024 * 1024;
/** A PDF file can carry fonts and pictures. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
/** A Word file holds its pictures as they were added, so a paper with a few diagrams or photos is much larger than one of text. */
export const MAX_WORD_BYTES = 25 * 1024 * 1024;

/** The kind of a file by its name, or null for one the import cannot read. */
export function importKind(fileName: string): ImportKind | null {
  const name = fileName.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.xlsx')) return 'sheet';
  if (name.endsWith('.docx')) return 'word';
  if (name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  return null;
}

/** Why a file cannot be read at all, or null when it can be tried. */
export function fileProblem(file: { name: string; size: number }): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.doc')) return 'An old Word (.doc) file cannot be read. Open it in Word and save it as a .docx file, then choose that.';
  const kind = importKind(name);
  if (!kind) return 'Choose a CSV, Excel (.xlsx), Word (.docx), PDF or Markdown (.md) file.';
  if (kind === 'sheet' && file.size > MAX_IMPORT_BYTES) return 'That file is larger than 2 MB. An exam of 100 questions is much smaller.';
  if (kind === 'markdown' && file.size > MAX_MARKDOWN_BYTES) return 'That file is larger than 25 MB. Save it again with smaller pictures and try again.';
  if (kind === 'word' && file.size > MAX_WORD_BYTES) return 'That file is larger than 25 MB. Save it again with smaller pictures and try again.';
  if (kind === 'pdf' && file.size > MAX_DOCUMENT_BYTES) return 'That file is larger than 25 MB. Save it again with smaller pictures and try again.';
  return null;
}
