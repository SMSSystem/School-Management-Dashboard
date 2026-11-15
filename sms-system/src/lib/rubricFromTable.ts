import type { RubricCriterion, RubricLevel } from "@/types/assessment";
import { readOtherLayouts } from "./rubricLayouts";
import {
  clean,
  HEADER_START,
  MAX_CELL_CHARS,
  MAX_CRITERIA,
  MAX_LEVELS,
  MAX_NAME_CHARS,
  parseLevelLabel,
  titleAbove,
  TOTAL_ROW,
} from "./rubricLevels";

export { parseLevelLabel };

// Turns a table of text cells into a rubric's grid (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.3). Every reader
// produces rows of text and comes here, so they all accept the same layout:
//
//   Criterion         | Max points | Excellent (4)      | Good (3)
//   Content and ideas | 4          | Clear and complete | Mostly clear
//
// Rows above the header are skipped, and points may also be written "4 - Excellent" or "Excellent 4 pts". The app's own
// downloads read back too, including the "Level 1" columns whose cells name their own level, "Good (3): Mostly clear".
// A table with fewer than two level columns, or with no points in any level heading, is not read, so a list such as
// "Criteria | Marks" or a mark sheet stays file-only rather than becoming a wrong grid. When the template's layout doesn't fit,
// the other layouts real files use are tried (rubricLayouts.ts). Nothing here is saved: the teacher reviews the result, and the
// form's checks apply. Pure.

export type RubricGridRead = {
  criteria: RubricCriterion[];
  warnings: string[];
  /** A title row above the header inside the table, such as "Essay rubric", when there is one. */
  heading?: string;
};

/** A rubric found in a file: its grid, a heading for its title, and where in the file it came from. */
export type FoundRubric = RubricGridRead & { heading: string; source: string };

/** A table from a file, with the heading above it (or its sheet's name) and a description of where it is. */
export type SourcedTable = {
  rows: readonly (readonly string[])[];
  heading?: string;
  source: string;
};

const MAX_POINTS_HEADER =
  /^(?:max(?:imum)?\.?\s*(?:points?|marks?|scores?)|points?\s+possible|out\s+of)$/i;
/** Columns that say something about a row without being a level of it. */
const NOT_A_LEVEL =
  /\b(?:marks?|points?|scores?|comments?|remarks?|weights?|weighting|grades?|names?|totals?|awarded|allotted)\b/i;
const NUMBERED_COLUMN = /^level\s*\d+$/i;
const WEIGHT_IN_NAME = /(?:[×*]|\bx)\s*\d+(?:\.\d+)?\s*$/i;
const NUMBER = String.raw`\d+(?:\.\d+)?`;
const CELL_WITH_LEVEL = new RegExp(
  String.raw`^(.+?)\s*\(\s*(${NUMBER})\s*\)(?::\s*(.*))?$`,
  "s",
);

type Layout = {
  headerRow: number;
  nameColumn: number;
  maxColumn: number | null;
  levelColumns: { column: number; heading: string }[];
};

function isLevelHeading(heading: string): boolean {
  if (!heading) return false;
  const { label, points } = parseLevelLabel(heading);
  // "Excellent 4 pts" is a level whatever its words are, and "Marks" with no number is not.
  return points !== null || !NOT_A_LEVEL.test(label);
}

/** The header row and what each of its columns holds, or null when no row looks like one. */
/**
 * The columns of a header row whose criteria column is `nameColumn`. The table ends at a blank heading or another criteria
 * heading, because a second table may sit further along the same rows.
 */
function headerColumns(cells: readonly string[], nameColumn: number) {
  let maxColumn: number | null = null;
  const levelColumns: Layout["levelColumns"] = [];
  for (let column = nameColumn + 1; column < cells.length; column += 1) {
    const heading = cells[column];
    if (!heading || HEADER_START.test(heading)) break;
    if (MAX_POINTS_HEADER.test(heading)) maxColumn = column;
    else if (isLevelHeading(heading)) levelColumns.push({ column, heading });
  }
  return { maxColumn, levelColumns };
}

function findLayout(rows: readonly (readonly string[])[]): Layout | null {
  for (let headerRow = 0; headerRow < rows.length; headerRow += 1) {
    const cells = rows[headerRow].map((cell) =>
      clean(cell).slice(0, MAX_NAME_CHARS),
    );
    const nameColumn = cells.findIndex((cell) => cell !== "");
    if (nameColumn === -1 || !HEADER_START.test(cells[nameColumn])) continue;
    const { maxColumn, levelColumns } = headerColumns(cells, nameColumn);
    // A rubric gives its levels points. A table where no level heading has any, such as a mark sheet with a column per test,
    // is not a rubric, and its rows may be students, so it is never read.
    const scored = levelColumns.some(
      ({ heading }) => parseLevelLabel(heading).points !== null,
    );
    if (levelColumns.length >= 2 && scored)
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
  if (!layout) return readOtherLayouts(rows) ?? { criteria: [], warnings: [] };
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
  // A rubric describes its levels in words. When every filled level cell is a bare number, the rows are someone's marks,
  // such as a mark sheet with a column per task, so nothing is read.
  const described = criteria
    .flatMap((c) => c.levels.map((l) => l.description ?? ""))
    .filter(Boolean);
  if (
    criteria.length === 0 ||
    (described.length > 0 &&
      described.every((text) => /^[d.,%s/-]+$/.test(text)))
  )
    return { criteria: [], warnings: [] };
  const heading = titleAbove(rows.slice(0, layout.headerRow));
  return {
    criteria,
    ...(heading && { heading }),
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

/**
 * Every rubric in a file's tables, in order (D18). A title row inside a table is its heading; otherwise the heading above the
 * table, or the sheet's name, is used. A table with no rubric gives nothing, so a sheet of names and marks is never read.
 */
export function rubricsFromTables(
  tables: readonly SourcedTable[],
): FoundRubric[] {
  return tables.flatMap((table) => {
    const read = rubricFromTable(table.rows);
    if (read.criteria.length === 0) return [];
    return [
      {
        ...read,
        heading: read.heading || titleAbove([[table.heading ?? ""]]),
        source: table.source,
      },
    ];
  });
}
