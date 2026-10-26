// Lines of text from the pieces of text a PDF reader reports (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4). A PDF
// has no paragraphs or lines, only strings placed at coordinates; the exam import needs lines, so the strings are grouped
// by their baseline, ordered top to bottom and left to right, and joined with a space where there is a visible gap.
// A page break becomes an empty line. Pages laid out in columns, or questions placed in tables, can come out in a
// different order than they read; the review step in the builder is where that is caught. A picture painted on the page
// is put in as a marker line (see examImportPictures.ts) before the first line of text that starts below its top edge, so
// the question parser sees it where it stands: after the question's text and before the options, or elsewhere. Pure, with
// no PDF library.

import { PICTURE_MARKER_PREFIX } from './examImportPictures';

export type TextPiece = {
  str: string;
  /** Left edge and baseline, in PDF units (the origin is the page's bottom left). */
  x: number;
  y: number;
  width: number;
  height: number;
};

// A gap wider than this share of the text height reads as a space.
const SPACE_GAP = 0.15;
// Pieces whose baselines differ by less than this share of their height are on one line.
const SAME_LINE = 0.5;

/** A picture on a page: the y of its top edge (PDF units) and its index in the file's list of pictures. */
export type PagePicture = { top: number; index: number };

const squeeze = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The lines of one page. */
export function linesOfPage(pieces: readonly TextPiece[], pictures: readonly PagePicture[] = []): string[] {
  const usable = pieces.filter((p) => p.str.trim() !== '' || p.str === ' ');
  const byTop = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextPiece[][] = [];
  for (const piece of byTop) {
    const row = rows[rows.length - 1];
    const tolerance = Math.max(2, Math.max(piece.height, row?.[0]?.height ?? 0) * SAME_LINE);
    if (row && Math.abs(row[0].y - piece.y) <= tolerance) row.push(piece);
    else rows.push([piece]);
  }
  const lines = rows
    .map((row) => {
      const ordered = [...row].sort((a, b) => a.x - b.x);
      let text = '';
      let end = Number.NEGATIVE_INFINITY;
      let height = 0;
      for (const piece of ordered) {
        const gap = piece.x - end;
        const spaced = /\s$/.test(text) || /^\s/.test(piece.str);
        if (text !== '' && !spaced && gap > Math.max(height, piece.height) * SPACE_GAP) text += ' ';
        text += piece.str;
        end = piece.x + piece.width;
        height = piece.height;
      }
      return { y: row[0].y, text: squeeze(text) };
    })
    .filter((line) => line.text !== '');
  if (pictures.length === 0) return lines.map((line) => line.text);

  const out: string[] = [];
  const waiting = [...pictures].sort((a, b) => b.top - a.top || a.index - b.index);
  for (const line of lines) {
    while (waiting.length > 0 && line.y < waiting[0].top) out.push(`${PICTURE_MARKER_PREFIX}${(waiting.shift() as PagePicture).index}`);
    out.push(line.text);
  }
  for (const picture of waiting) out.push(`${PICTURE_MARKER_PREFIX}${picture.index}`);
  return out;
}

/** The lines of every page in order, with an empty line between pages; `pictures` are the pictures of each page. */
export function linesOfPages(pages: readonly (readonly TextPiece[])[], pictures: readonly (readonly PagePicture[])[] = []): string[] {
  const out: string[] = [];
  pages.forEach((page, i) => {
    if (i > 0) out.push('');
    out.push(...linesOfPage(page, pictures[i] ?? []));
  });
  return out;
}

/**
 * Does the file look like a scan? A scanned page is a picture with no text, so almost nothing comes out. Fewer than 10
 * visible characters in all, or fewer than 8 a page over several pages, is not a text PDF.
 */
export function looksScanned(lines: readonly string[], pageCount: number): boolean {
  const visible = lines.reduce((n, line) => n + line.replace(/\s/g, '').length, 0);
  return visible < 10 || (pageCount >= 2 && visible / pageCount < 8);
}
