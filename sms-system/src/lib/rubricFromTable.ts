import type { RubricCriterion, RubricLevel } from "@/types/assessment";

// Turns a table of text cells into a rubric's grid (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.3). Every reader
// produces rows of text and comes here, so they all accept the same layout:
//
//   Criterion         | Max points | Excellent (4)      | Good (3)
//   Content and ideas | 4          | Clear and complete | Mostly clear
//
// Rows above the header are skipped, and points may also be written "4 - Excellent" or "Excellent 4 pts". The app's own
// downloads read back too, including the "Level 1" columns whose cells name their own level, "Good (3): Mostly clear".
// A table with fewer than two level columns is not read, so a list such as "Criteria | Marks" stays file-only rather than
// becoming a wrong grid. Nothing here is saved: the teacher reviews the result, and the form's checks apply. Pure.

export type RubricGridRead = {
  criteria: RubricCriterion[];
  warnings: string[];
};

const MAX_CRITERIA = 50;
const MAX_LEVELS = 10;
/** Keeps a read grid well under Firestore's 1 MiB document limit: 50 × 11 cells × 1,000 characters. */
const MAX_CELL_CHARS = 1000;
const MAX_NAME_CHARS = 200;

const HEADER_START =
  /^(?:criteri(?:on|a)|categor(?:y|ies)|dimensions?|traits?)\b/i;
const MAX_POINTS_HEADER =
  /^(?:max(?:imum)?\.?\s*(?:points?|marks?|scores?)|points?\s+possible|out\s+of)$/i;
/** Columns that say something about a row without being a level of it. */
const NOT_A_LEVEL =
  /\b(?:marks?|points?|scores?|comments?|remarks?|weights?|weighting|grades?|names?|totals?|awarded|allotted)\b/i;
const NUMBERED_COLUMN = /^level\s*\d+$/i;
const TOTAL_ROW = /^(?:grand\s+|sub-?)?total\b/i;
const WEIGHT_IN_NAME = /(?:[×*]|\bx)\s*\d+(?:\.\d+)?\s*$/i;

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const RANGE = String.raw`(${NUMBER})(?:\s*(?:-|–|—|to)\s*(${NUMBER}))?`;
const UNIT = String.raw`(?:pts?\.?|points?|marks?)`;
const IN_BRACKETS = new RegExp(
  String.raw`^(.*?)\s*[([]\s*${RANGE}\s*${UNIT}?\s*[)\]]$`,
  "i",
);
const POINTS_FIRST = new RegExp(
  String.raw`^${RANGE}\s*${UNIT}?\s*[-–—:.]\s*(.+)$`,
  "i",
);
const POINTS_LAST = new RegExp(String.raw`^(.+?)\s+${RANGE}\s*${UNIT}?$`, "i");
const POINTS_ONLY = new RegExp(String.raw`^${RANGE}\s*${UNIT}?$`, "i");
const CELL_WITH_LEVEL = new RegExp(
  String.raw`^(.+?)\s*\(\s*(${NUMBER})\s*\)(?::\s*(.*))?$`,
  "s",
);

type ParsedLabel = { label: string; points: number | null; range: boolean };

const parsed = (
  label: string,
  low: string | undefined,
  high: string | undefined,
): ParsedLabel => ({
  label,
  points: Number(high ?? low),
  range: high !== undefined,
});

/** A level's name and points, from a column heading. Exported for the tests. */
export function parseLevelLabel(text: string): ParsedLabel {
  const only = POINTS_ONLY.exec(text);
  if (only) return parsed(text, only[1], only[2]);
  const brackets = IN_BRACKETS.exec(text);
  if (brackets) return parsed(brackets[1] || text, brackets[2], brackets[3]);
  const first = POINTS_FIRST.exec(text);
  if (first) return parsed(first[3], first[1], first[2]);
  const last = POINTS_LAST.exec(text);
  if (last) return parsed(last[1], last[2], last[3]);
  return { label: text, points: null, range: false };
}

type Layout = {
  headerRow: number;
  nameColumn: number;
  maxColumn: number | null;
  levelColumns: { column: number; heading: string }[];
};

const clean = (cell: string | undefined) =>
  (cell ?? "").replace(/\s+/g, " ").trim();

function isLevelHeading(heading: string): boolean {
  if (!heading) return false;
  const { label, points } = parseLevelLabel(heading);
  // "Excellent 4 pts" is a level whatever its words are, and "Marks" with no number is not.
  return points !== null || !NOT_A_LEVEL.test(label);
}

/** The header row and what each of its columns holds, or null when no row looks like one. */
function findLayout(rows: readonly (readonly string[])[]): Layout | null {
  for (let headerRow = 0; headerRow < rows.length; headerRow += 1) {
    const cells = rows[headerRow].map((cell) =>
      clean(cell).slice(0, MAX_NAME_CHARS),
    );
    const nameColumn = cells.findIndex((cell) => cell !== "");
    if (nameColumn === -1 || !HEADER_START.test(cells[nameColumn])) continue;
    let maxColumn: number | null = null;
    const levelColumns: Layout["levelColumns"] = [];
    cells.forEach((heading, column) => {
      if (column <= nameColumn) return;
      if (MAX_POINTS_HEADER.test(heading)) maxColumn = column;
      else if (isLevelHeading(heading)) levelColumns.push({ column, heading });
    });
    if (levelColumns.length >= 2)
      return { headerRow, nameColumn, maxColumn, levelColumns };
  }
  return null;
}

/** What is noticed while reading, reported once each at the end. */
type Notes = {
  range: boolean;
  noPoints: boolean;
  weight: boolean;
  overMax: boolean;
  total: boolean;
  unnamed: boolean;
  shortened: boolean;
};

function cellText(cell: string | undefined, notes: Notes): string {
  const text = clean(cell);
  if (text.length <= MAX_CELL_CHARS) return text;
  notes.shortened = true;
  return text.slice(0, MAX_CELL_CHARS);
}

function levelFromNumberedCell(
  heading: string,
  cell: string,
  notes: Notes,
): RubricLevel | null {
  if (!cell) return null;
  const named = CELL_WITH_LEVEL.exec(cell);
  if (named) {
    return {
      label: named[1],
      points: Number(named[2]),
      description: named[3] ?? "",
    };
  }
  notes.noPoints = true;
  return { label: heading, points: 0, description: cell };
}

function levelFromHeading(
  heading: string,
  cell: string,
  notes: Notes,
): RubricLevel {
  const { label, points, range } = parseLevelLabel(heading);
  if (range) notes.range = true;
  if (points === null) notes.noPoints = true;
  return { label, points: points ?? 0, description: cell };
}

function criterionFromRow(
  row: readonly string[],
  name: string,
  layout: Layout,
  notes: Notes,
): RubricCriterion {
  const levels = layout.levelColumns
    .slice(0, MAX_LEVELS)
    .flatMap(({ column, heading }) => {
      const cell = cellText(row[column], notes);
      if (!NUMBERED_COLUMN.test(heading))
        return [levelFromHeading(heading, cell, notes)];
      const level = levelFromNumberedCell(heading, cell, notes);
      return level ? [level] : [];
    });
  const highest = Math.max(0, ...levels.map((level) => level.points));
  const stated =
    layout.maxColumn === null ? NaN : Number(clean(row[layout.maxColumn]));
  const maxPoints = stated > 0 ? stated : highest;
  if (highest > maxPoints) notes.overMax = true;
  if (WEIGHT_IN_NAME.test(name)) notes.weight = true;
  return { id: crypto.randomUUID(), name, maxPoints, levels };
}

const WARNINGS: [keyof Notes, string][] = [
  [
    "range",
    "Some levels gave a range of points, such as 3-4. The top value was used.",
  ],
  [
    "noPoints",
    "Some levels gave no points, so they start at 0. Fill them in below.",
  ],
  [
    "weight",
    "A criterion looks weighted, such as “× 3”. Weights aren't supported, so it stays in the name.",
  ],
  ["overMax", "Some levels are worth more than their criterion's max points."],
  ["total", "A Total row was left out."],
  ["unnamed", "A row with no criterion name was left out."],
  ["shortened", "Some very long text was shortened."],
];

/** Reads one table. `criteria` is empty when no grid was found in it. */
export function rubricFromTable(
  rows: readonly (readonly string[])[],
): RubricGridRead {
  const layout = findLayout(rows);
  if (!layout) return { criteria: [], warnings: [] };
  const notes: Notes = {
    range: false,
    noPoints: false,
    weight: false,
    overMax: false,
    total: false,
    unnamed: false,
    shortened: false,
  };
  const criteria: RubricCriterion[] = [];
  let tooMany = false;
  for (const row of rows.slice(layout.headerRow + 1)) {
    const name = clean(row[layout.nameColumn]);
    if (TOTAL_ROW.test(name)) notes.total = true;
    else if (name && criteria.length === MAX_CRITERIA) tooMany = true;
    else if (name)
      criteria.push(
        criterionFromRow(row, name.slice(0, MAX_NAME_CHARS), layout, notes),
      );
    else if (row.some((cell) => clean(cell))) notes.unnamed = true;
  }
  if (criteria.length === 0) return { criteria: [], warnings: [] };
  return {
    criteria,
    warnings: [
      ...WARNINGS.filter(([key]) => notes[key]).map(([, text]) => text),
      ...(tooMany
        ? [`Only the first ${MAX_CRITERIA} criteria were kept.`]
        : []),
      ...(layout.levelColumns.length > MAX_LEVELS
        ? [`Only the first ${MAX_LEVELS} levels were kept.`]
        : []),
    ],
  };
}

/** Reads several tables from one file, and keeps the one with the most criteria. */
export function rubricFromTables(
  tables: readonly (readonly (readonly string[])[])[],
): RubricGridRead {
  const found = tables
    .map(rubricFromTable)
    .filter((read) => read.criteria.length > 0);
  if (found.length === 0) return { criteria: [], warnings: [] };
  const largest = found.reduce((best, read) =>
    read.criteria.length > best.criteria.length ? read : best,
  );
  return found.length === 1
    ? largest
    : {
        criteria: largest.criteria,
        warnings: [
          `This file has ${found.length} rubric tables. Only the largest was read.`,
          ...largest.warnings,
        ],
      };
}
