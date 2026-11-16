import type { TextPiece } from "./pdfLines";
import type { SourcedTable } from "./rubricFromTable";
import { HEADER_START } from "./rubricLevels";

// A rubric table out of a PDF page (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D21). A PDF has no tables, only pieces of
// text at positions, so a table is rebuilt from them: the header row gives the columns, by where its cells start, and each
// piece below goes to the column it starts in. A line close under the one above, within about a line and a half, continues
// the same row on a new line, so a wrapped criterion name or a stack of mark ranges stays together. The table ends at the
// first line that starts left of it, such as "Comments:". One table per page; a table running onto the next page isn't joined.
// The rows then go through the same layouts as any other file. Pure, with no PDF library.

/** A gap wider than this many text heights between two pieces on a line starts a new cell, in the header. */
const CELL_GAP = 2;
/** Pieces whose baselines differ by less than this share of their height are on one line, as in pdfLines.ts. */
const SAME_LINE = 0.5;
/** A line closer than this many text heights under the one above continues its row. */
const CONTINUES = 1.6;
/** A gap wider than this share of the text height reads as a space. */
const SPACE_GAP = 0.15;
/** A column takes pieces that start up to this far left of it, for text that isn't quite aligned. */
const SLACK = 3;
/** Lines above a table longer than this, or ending in a full stop, are instructions, not a title. */
const MAX_TITLE_WORDS = 10;
const MARKS_HEADING = /\b(?:marks?|points?)\s*\)?$/i;

type Line = { y: number; height: number; pieces: TextPiece[] };

/** A page's pieces grouped into lines by baseline, top to bottom, each ordered left to right. */
function linesOf(pieces: readonly TextPiece[]): Line[] {
  const usable = pieces.filter((p) => p.str.trim() !== "");
  const byTop = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const piece of byTop) {
    const line = lines[lines.length - 1];
    const tolerance = Math.max(
      2,
      Math.max(piece.height, line?.height ?? 0) * SAME_LINE,
    );
    if (line && Math.abs(line.y - piece.y) <= tolerance) {
      line.pieces.push(piece);
      line.height = Math.max(line.height, piece.height);
    } else lines.push({ y: piece.y, height: piece.height, pieces: [piece] });
  }
  for (const line of lines) line.pieces.sort((a, b) => a.x - b.x);
  return lines;
}

/** Pieces joined into text, with a space where there is a visible gap. */
function joined(pieces: readonly TextPiece[]): string {
  let text = "";
  let end = Number.NEGATIVE_INFINITY;
  for (const piece of pieces) {
    const spaced = /\s$/.test(text) || /^\s/.test(piece.str);
    if (text && !spaced && piece.x - end > piece.height * SPACE_GAP)
      text += " ";
    text += piece.str;
    end = piece.x + piece.width;
  }
  return text.replace(/\s+/g, " ").trim();
}

/** A line's cells, split where the gap between pieces is wide: used to find a header. */
function cellsOf(line: Line): { x: number; text: string }[] {
  const cells: { x: number; pieces: TextPiece[] }[] = [];
  let end = Number.NEGATIVE_INFINITY;
  for (const piece of line.pieces) {
    const last = cells[cells.length - 1];
    if (!last || piece.x - end > line.height * CELL_GAP)
      cells.push({ x: piece.x, pieces: [piece] });
    else last.pieces.push(piece);
    end = Math.max(end, piece.x + piece.width);
  }
  return cells.map((cell) => ({ x: cell.x, text: joined(cell.pieces) }));
}

const isHeader = (cells: readonly { text: string }[]) =>
  cells.length >= 2 &&
  cells.some(({ text }) => HEADER_START.test(text) || MARKS_HEADING.test(text));

/** A line's text in each column: a piece belongs to the column whose left edge is nearest at or before it. */
function inColumns(line: Line, columns: readonly number[]): string[] {
  const groups: TextPiece[][] = columns.map(() => []);
  for (const piece of line.pieces) {
    let column = 0;
    columns.forEach((x, i) => {
      if (piece.x + SLACK >= x) column = i;
    });
    groups[column].push(piece);
  }
  return groups.map(joined);
}

/** A line above the table that could be its title: short, and not a sentence. Form fields are skipped later. */
function couldBeTitle(text: string): boolean {
  return text.split(/\s+/).length <= MAX_TITLE_WORDS && !/\.$/.test(text);
}

/** The rows of the table under a header, until a line starts left of the first column. */
function bodyRows(
  lines: readonly Line[],
  columns: readonly number[],
): string[][] {
  const rows: string[][] = [];
  let previous: Line | null = null;
  for (const line of lines) {
    if (line.pieces[0].x + SLACK < columns[0]) break;
    const cells = inColumns(line, columns);
    const row = rows[rows.length - 1];
    if (
      row &&
      previous &&
      previous.y - line.y < CONTINUES * Math.max(line.height, previous.height)
    ) {
      cells.forEach((text, i) => {
        if (text) row[i] = row[i] ? `${row[i]}\n${text}` : text;
      });
    } else rows.push(cells);
    previous = line;
  }
  return rows;
}

/** The table on one PDF page, or null when no line looks like a rubric's header. */
export function pdfTable(
  pieces: readonly TextPiece[],
  pageNumber: number,
): SourcedTable | null {
  const lines = linesOf(pieces);
  const headerIndex = lines.findIndex((line) => isHeader(cellsOf(line)));
  if (headerIndex === -1) return null;
  const header = cellsOf(lines[headerIndex]);
  const columns = header.map((cell) => cell.x);
  const above = lines
    .slice(0, headerIndex)
    .map((line) => joined(line.pieces))
    .filter(couldBeTitle)
    .map((text) => [text]);
  return {
    rows: [
      ...above,
      header.map((cell) => cell.text),
      ...bodyRows(lines.slice(headerIndex + 1), columns),
    ],
    source: `Page ${pageNumber}`,
  };
}

/** The table on each page that has one. */
export const pdfTables = (
  pages: readonly (readonly TextPiece[])[],
): SourcedTable[] =>
  pages.flatMap((pieces, i) => {
    const table = pdfTable(pieces, i + 1);
    return table ? [table] : [];
  });
