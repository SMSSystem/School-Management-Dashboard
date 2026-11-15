// The pieces every rubric layout shares (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.3): reading a level's points
// from its text, tidying a cell, and choosing a title from the lines above a table. Kept apart so the template layout
// (rubricFromTable.ts) and the other layouts (rubricLayouts.ts) can share them without importing each other. Pure.

export const MAX_CRITERIA = 50;
export const MAX_LEVELS = 10;
/** Keeps a read grid well under Firestore's 1 MiB document limit: 50 × 11 cells × 1,000 characters. */
export const MAX_CELL_CHARS = 1000;
export const MAX_NAME_CHARS = 200;

/** Marks a line that was a list item in a Word cell, so a list item wrapped over two paragraphs can be joined back up. */
export const LIST_MARKER = "• ";

export const HEADER_START =
  /^(?:criteri(?:on|a)|categor(?:y|ies)|dimensions?|traits?)\b/i;
export const TOTAL_ROW = /^(?:grand\s+|sub-?)?total\b/i;
/** Column headings about one student's work. Their cells are never read as levels or maximums. */
export const STUDENT_COLUMN =
  /\b(?:awarded|obtained|achieved|students?|names?|scored?|learners?|pupils?)\b/i;

const NUMBER = String.raw`\d+(?:\.\d+)?`;
export const RANGE = String.raw`(${NUMBER})(?:\s*(?:-|–|—|to)\s*(${NUMBER}))?`;
export const UNIT = String.raw`(?:pts?\.?|points?|marks?)`;
const IN_BRACKETS = new RegExp(
  String.raw`^(.*?)\s*[([]\s*${RANGE}\s*${UNIT}?\s*[)\]]$`,
  "i",
);
const POINTS_FIRST = new RegExp(
  String.raw`^${RANGE}\s*${UNIT}?\s*[-–—:.]\s*(.+)$`,
  "i",
);
const POINTS_LAST = new RegExp(String.raw`^(.+?)\s+${RANGE}\s*${UNIT}?$`, "i");
export const POINTS_ONLY = new RegExp(String.raw`^${RANGE}\s*${UNIT}?$`, "i");

export type ParsedLabel = {
  label: string;
  points: number | null;
  range: boolean;
};

const parsed = (
  label: string,
  low: string | undefined,
  high: string | undefined,
): ParsedLabel => ({
  label,
  points: Number(high ?? low),
  range: high !== undefined,
});

/** A level's name and points, from text such as "Excellent (4)", "4 - Excellent", "Excellent 4 pts" or "3-4". */
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

/** A cell as one line of text: list markers dropped, and all whitespace, line breaks included, made single spaces. */
export const clean = (cell: string | undefined) =>
  (cell ?? "")
    .split("\n")
    .map((line) =>
      line.startsWith(LIST_MARKER) ? line.slice(LIST_MARKER.length) : line,
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/** A cell's lines, each tidied, with empty ones dropped. List markers are kept, for the layouts that need them. */
export const cellLines = (cell: string | undefined): string[] =>
  (cell ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && line !== LIST_MARKER.trim());

/** A line that is a form field, such as "Name: …", or a date or number, which is never offered as a rubric's title. */
const NOT_A_TITLE = [
  /:/,
  /\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/,
  /^[\d\s.,/%()-]+$/,
];

/**
 * The nearest line above a table's header that could be its title, or "" when there is none (D23). "Label: value" lines are
 * form fields, such as a student's or an assessor's name, so they are never offered, nor are dates or bare numbers.
 */
export function titleAbove(rows: readonly (readonly string[])[]): string {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const text = rows[i].map(clean).filter(Boolean).join(" ");
    if (text && !NOT_A_TITLE.some((pattern) => pattern.test(text)))
      return text.slice(0, MAX_NAME_CHARS);
  }
  return "";
}
