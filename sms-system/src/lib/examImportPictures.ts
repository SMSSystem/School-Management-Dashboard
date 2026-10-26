// The pictures of an imported document, as far as the question parser and the import dialog need to know them
// (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8). Pure, and it imports nothing: the Word reader that finds
// the pictures needs the zip library, the parser that places them is shared with the PDF reader, so the words they share
// live here.

/** A picture's line in the text starts with this (a character no real text holds), then its index in the picture list. */
export const PICTURE_MARKER_PREFIX = '\u0000IMG:';

/** The index a marker line names, or null for any other line. */
export function pictureIndexOf(line: string): number | null {
  if (!line.startsWith(PICTURE_MARKER_PREFIX)) return null;
  const n = Number(line.slice(PICTURE_MARKER_PREFIX.length));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** One picture of a document. `bytes` is null when the file could not give it (see `problem`). */
export type ImportPicture = {
  bytes: Uint8Array | null;
  /** The file's extension in lower case (png, jpeg, emf …). */
  format: string;
  /** The document's own description of the picture (empty when there is none). */
  alt: string;
  /** The document cropped it; the whole original is what is imported. */
  cropped: boolean;
  problem?: 'unsupported' | 'too_large' | 'missing';
};

/**
 * How sure the parser is of where a picture goes: `clear` after a question's text and before its first option, `check`
 * anywhere else in a question (among or after the options, after the answer, or a second picture on one question), and
 * `unassigned` when no question holds it (before the first question, or its question was left out).
 */
export type ImportImageConfidence = 'clear' | 'check' | 'unassigned';

/** Where the picture with this index stands: in the question at `questionIndex` of the result, or in none. */
export type ImportImage = { index: number; questionIndex: number | null; confidence: ImportImageConfidence };
