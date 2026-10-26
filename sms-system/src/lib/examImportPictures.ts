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

/**
 * A line that tells the parser what kind a question is when the file says it without an answer line (a Google Forms printout
 * says "Mark only one oval." or "Check all that apply."): this, then `single` or `multiple`. Like the picture marker it starts
 * with a character no real text holds and is never part of a question's text.
 */
export const KIND_MARKER_PREFIX = '\u0000KIND:';

/** The kind a marker line names, or null for any other line. */
export function kindOf(line: string): 'single' | 'multiple' | null {
  if (!line.startsWith(KIND_MARKER_PREFIX)) return null;
  const kind = line.slice(KIND_MARKER_PREFIX.length);
  return kind === 'single' || kind === 'multiple' ? kind : null;
}

/** The most one picture may be (10 MB), the most all the pictures of a file together may be (64 MB), and how many are read (one for a question). */
export const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
export const MAX_PICTURES_TOTAL_BYTES = 64 * 1024 * 1024;
export const MAX_PICTURES = 100;

/**
 * The bytes of base64 text (a data address of a picture in a Markdown file). Whitespace is ignored and a `%`-escaped address
 * is decoded first; text that is not base64 is `invalid`, and one that would decode to more than `maxBytes` is `too_large`,
 * which is decided from its length before anything is decoded.
 */
export function decodeBase64(text: string, maxBytes: number): { bytes: Uint8Array } | { problem: 'too_large' | 'invalid' } {
  let clean = text.replace(/\s+/g, '');
  if (clean.includes('%')) {
    try {
      clean = decodeURIComponent(clean);
    } catch {
      return { problem: 'invalid' };
    }
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length === 0 || clean.length % 4 === 1) return { problem: 'invalid' };
  if ((clean.length * 3) / 4 > maxBytes + 3) return { problem: 'too_large' };
  try {
    const binary = atob(clean);
    if (binary.length > maxBytes) return { problem: 'too_large' };
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes };
  } catch {
    return { problem: 'invalid' };
  }
}
