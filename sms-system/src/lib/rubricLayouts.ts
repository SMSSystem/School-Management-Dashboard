import type { RubricCriterion, RubricLevel } from "@/types/assessment";
import {
  cellLines,
  clean,
  HEADER_START,
  LIST_MARKER,
  MAX_CELL_CHARS,
  MAX_CRITERIA,
  MAX_LEVELS,
  MAX_NAME_CHARS,
  parseLevelLabel,
  POINTS_ONLY,
  RANGE,
  STUDENT_COLUMN,
  titleAbove,
  TOTAL_ROW,
  UNIT,
} from "./rubricLevels";

// The other layouts real rubric files use (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D17 and D19), tried after the
// template's layout fails:
//
//   Shared scale         Criteria      | Rating scale  | Marks awarded       one scale beside the criteria, for all of them
//                        Content       | 5. Excellent  | 3
//                        Organisation  | 4. Good       | 4
//
//   Mark ranges          Area          | Allotted marks                      levels as lines (or Word list items) in one cell,
//                        Content       | 8-10 marks                          each beside a range in the next cell
//                        • clear...    | 3-7 marks
//
//   Allotted marks       Criteria      | Allotted marks                      a maximum for each criterion, and no levels
//                        Content       | 10
//
// A column about one student's work, such as "Marks awarded", is never read. Each returns null when the table isn't its
// layout, so nothing is guessed. Pure.

export type LayoutRead = {
  criteria: RubricCriterion[];
  warnings: string[];
  heading: string;
};

const RANGE_LINE = new RegExp(String.raw`^${RANGE}\s*${UNIT}?$`, "i");
const ALLOTTED_HEADING =
  /\b(?:allotted|allocated|maximum|max\.?|possible|out\s+of|available)\b/i;
const MARKS_HEADING = /\b(?:marks?|points?)\s*\)?$/i;

const id = () => crypto.randomUUID();
const short = (text: string, max = MAX_CELL_CHARS) => text.slice(0, max);

/** The first row whose first filled cell names the criteria column, and that column. */
function criteriaHeader(rows: readonly (readonly string[])[]) {
  for (let row = 0; row < rows.length; row += 1) {
    const cells = rows[row].map(clean);
    const column = cells.findIndex(Boolean);
    if (column !== -1 && HEADER_START.test(cells[column]))
      return { row, column, cells };
  }
  return null;
}

/** The rows under a header that name a criterion: not blank, not a Total row, and not a copy of the header from merged cells. */
function criterionRows(
  rows: readonly (readonly string[])[],
  header: { row: number; column: number; cells: string[] },
) {
  const headerName = header.cells[header.column].toLowerCase();
  return rows.slice(header.row + 1).flatMap((row) => {
    const name = clean(row[header.column]).slice(0, MAX_NAME_CHARS);
    if (!name || TOTAL_ROW.test(name) || name.toLowerCase() === headerName)
      return [];
    return [{ row, name }];
  });
}

/** A scale entry such as "5. Excellent" or "Good (3)". A bare number is a mark, not a level, so it doesn't count. */
function scaleEntry(text: string): RubricLevel | null {
  if (!text || POINTS_ONLY.test(text)) return null;
  const { label, points } = parseLevelLabel(text);
  return points === null || !label.trim()
    ? null
    : { label: short(label, MAX_NAME_CHARS), points, description: "" };
}

/**
 * One scale written down the column right beside the criteria, and used for every one of them. Only that column, and only the
 * criterion rows, are read: a Total such as "(60 marks)" isn't a level, and a column further along may be one student's marks.
 */
export function readSharedScale(
  rows: readonly (readonly string[])[],
): LayoutRead | null {
  const header = criteriaHeader(rows);
  if (!header) return null;
  const column = header.column + 1;
  if (STUDENT_COLUMN.test(header.cells[column] ?? "")) return null;
  const named = criterionRows(rows, header);
  const levels = named
    .map(({ row }) => clean(row[column]))
    .filter(Boolean)
    .map(scaleEntry);
  const distinct = new Set(levels.map((level) => level?.points));
  if (
    levels.length < 2 ||
    levels.some((level) => !level) ||
    distinct.size !== levels.length
  )
    return null;
  const scale = (levels as RubricLevel[])
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_LEVELS);
  const criteria = named.slice(0, MAX_CRITERIA).map(({ name }) => ({
    id: id(),
    name,
    maxPoints: scale[0].points,
    levels: scale.map((level) => ({ ...level })),
  }));
  return {
    criteria,
    heading: titleAbove(rows.slice(0, header.row)),
    warnings: [
      "Every criterion uses the one scale in this file, with no level descriptions. Add descriptions below if you want them.",
      ...(named.length > MAX_CRITERIA
        ? [`Only the first ${MAX_CRITERIA} criteria were kept.`]
        : []),
    ],
  };
}

/** A line without the list marker a Word list item starts with. */
const unmarked = (line: string) =>
  line.startsWith(LIST_MARKER.trim())
    ? line.slice(LIST_MARKER.trim().length).trim()
    : line;

/** The items in a cell: Word list items with their wrapped lines joined, or else one item per line. */
function cellItems(lines: readonly string[]): string[] {
  if (!lines.some((line) => line.startsWith(LIST_MARKER.trim())))
    return [...lines];
  const items: string[] = [];
  for (const line of lines) {
    if (line.startsWith(LIST_MARKER.trim()))
      items.push(line.slice(LIST_MARKER.trim().length).trim());
    else if (items.length > 0) items[items.length - 1] += ` ${line}`;
  }
  return items;
}

type Range = { text: string; low: number; high: number };

const rangeOf = (line: string): Range | null => {
  const match = RANGE_LINE.exec(line);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2] ?? match[1]);
  return { text: line, low: Math.min(low, high), high: Math.max(low, high) };
};

/** Whether a criterion's ranges, highest first, overlap or leave a gap, such as 3-7 then 1-3. */
function rangesUneven(ranges: readonly Range[]): boolean {
  const sorted = [...ranges].sort((a, b) => b.high - a.high);
  return sorted.some((range, i) => {
    const next = sorted[i + 1];
    return !!next && (range.low <= next.high || range.low > next.high + 1);
  });
}

/** One criterion from a mark-ranges row, or why its levels and ranges didn't match. */
function rangeCriterion(nameCell: string, rangeCell: string) {
  const ranges = cellLines(rangeCell).map((line) => rangeOf(unmarked(line)));
  if (ranges.length < 2 || ranges.some((r) => !r)) return null;
  const [first, ...rest] = cellLines(nameCell);
  const name = clean(first ?? "")
    .replace(/^[-•]\s*/, "")
    .slice(0, MAX_NAME_CHARS);
  const items = cellItems(rest);
  if (!name) return null;
  if (items.length !== ranges.length) return { mismatch: true as const };
  const levels = (ranges as Range[]).slice(0, MAX_LEVELS).map((range, i) => ({
    label: short(range.text, MAX_NAME_CHARS),
    points: range.high,
    description: short(items[i]),
  }));
  return {
    criterion: {
      id: id(),
      name,
      maxPoints: Math.max(...levels.map((level) => level.points)),
      levels,
    },
    uneven: rangesUneven(ranges as Range[]),
  };
}

/** Levels written as lines (or list items) in one cell, beside a cell of mark ranges such as "8-10 marks". */
export function readMarkRanges(
  rows: readonly (readonly string[])[],
): LayoutRead | null {
  for (let headerRow = 0; headerRow < rows.length; headerRow += 1) {
    const column = rangesColumn(rows[headerRow].map(clean));
    if (column === -1) continue;
    const read = rangeRows(rows.slice(headerRow + 1), column);
    if (read.criteria.length === 0) continue;
    return {
      criteria: read.criteria,
      heading: titleAbove(rows.slice(0, headerRow)),
      warnings: [
        "Each level's points are the top of its range, and the range stays in its label.",
        ...(read.uneven
          ? [
              "Some mark ranges overlap or leave gaps, such as 3-7 and 1-3. Check them below.",
            ]
          : []),
        ...(read.mismatched
          ? [
              "A criterion was left out because its levels and mark ranges didn't match up. Add it below.",
            ]
          : []),
      ],
    };
  }
  return null;
}

/** The column headed "... marks" or "... points", with a heading to its left, that isn't about a student's marks; or -1. */
const rangesColumn = (cells: readonly string[]) =>
  cells.findIndex(
    (cell, i) =>
      i > 0 &&
      MARKS_HEADING.test(cell) &&
      !STUDENT_COLUMN.test(cell) &&
      !!cells[i - 1],
  );

/** The criteria in the rows under a mark-ranges header, and what to warn about. */
function rangeRows(rows: readonly (readonly string[])[], column: number) {
  const criteria: RubricCriterion[] = [];
  let mismatched = false;
  let uneven = false;
  for (const row of rows) {
    const read = rangeCriterion(row[column - 1] ?? "", row[column] ?? "");
    if (!read) continue;
    if ("mismatch" in read) mismatched = true;
    else if (criteria.length < MAX_CRITERIA) {
      criteria.push(read.criterion);
      uneven ||= read.uneven;
    }
  }
  return { criteria, mismatched, uneven };
}

/** A positive number of marks from a cell such as "10", "10 marks" or "(10)". */
function marksIn(text: string): number | null {
  const match = POINTS_ONLY.exec(text.replace(/^\((.*)\)$/, "$1").trim());
  const value = match ? Number(match[2] ?? match[1]) : NaN;
  return value > 0 ? value : null;
}

/**
 * The header of an allotted-marks list: a column with an explicit heading such as "Marks allotted", right beside a criteria
 * column. Requiring the two together keeps a mark sheet's "Criteria" column of students from being paired with a small
 * allotted-marks table further along the same rows.
 */
function allottedHeader(rows: readonly (readonly string[])[]) {
  for (let row = 0; row < rows.length; row += 1) {
    const cells = rows[row].map(clean);
    const column = cells.findIndex(
      (cell, i) =>
        i > 0 &&
        ALLOTTED_HEADING.test(cell) &&
        !STUDENT_COLUMN.test(cell) &&
        HEADER_START.test(cells[i - 1]),
    );
    if (column !== -1) return { row, column: column - 1, cells, marks: column };
  }
  return null;
}

/** Criteria with an allotted maximum each and no levels (D20), under an explicit heading such as "Allotted marks". */
export function readAllottedMarks(
  rows: readonly (readonly string[])[],
): LayoutRead | null {
  const header = allottedHeader(rows);
  if (!header) return null;
  const column = header.marks;
  const criteria = criterionRows(rows, header).flatMap(({ row, name }) => {
    const maxPoints = marksIn(clean(row[column]));
    return maxPoints === null
      ? []
      : [{ id: id(), name, maxPoints, levels: [] }];
  });
  // Maxima that count down by one, such as 5, 4, 3, 2, 1, are a scale legend ("Excellent 5, Good 4 ..."), not criteria.
  const countsDown =
    criteria.length >= 3 &&
    criteria.every(
      (c, i) => i === 0 || c.maxPoints === criteria[i - 1].maxPoints - 1,
    );
  if (criteria.length === 0 || countsDown) return null;
  const totalRow = rows
    .slice(header.row + 1)
    .find((row) => TOTAL_ROW.test(clean(row[header.column])));
  const total = totalRow ? marksIn(clean(totalRow[column])) : null;
  const sum = criteria.reduce((all, c) => all + c.maxPoints, 0);
  return {
    criteria: criteria.slice(0, MAX_CRITERIA),
    heading: titleAbove(rows.slice(0, header.row)),
    warnings: [
      "These criteria have no levels: each is marked out of its maximum. Add levels below if you want them.",
      ...(total !== null && total !== sum
        ? [
            `The Total row says ${total}, but the criteria add up to ${sum}. Check them below.`,
          ]
        : []),
      ...(criteria.length > MAX_CRITERIA
        ? [`Only the first ${MAX_CRITERIA} criteria were kept.`]
        : []),
    ],
  };
}

/** The first of the other layouts that fits the table, or null. */
export function readOtherLayouts(
  rows: readonly (readonly string[])[],
): LayoutRead | null {
  return (
    readSharedScale(rows) ?? readMarkRanges(rows) ?? readAllottedMarks(rows)
  );
}
