import {
  rubricsFromTables,
  type FoundRubric,
  type SourcedTable,
} from "./rubricFromTable";

// Reads a rubric's grid from a Markdown file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.4): pipe tables, or a
// heading for each criterion with a list of its levels. The text stays text, and is never rendered as HTML.
//
//   ## Content and ideas (4)
//   - Excellent (4): Clear and complete
//   - Good (3): Mostly clear

const DELIMITER_CELL = /^:?-+:?$/;
const HEADING = /^#{2,6}\s+(.+?)\s*#*$/;
const HEADING_POINTS =
  /^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:pts?\.?|points?|marks?)?\s*\)$/i;
const LIST_LEVEL = /^[-*+]\s+(.+?\(\s*\d+(?:\.\d+)?\s*\)(?::.*)?)$/;

/** A table row's cells. `\|` is a pipe in a cell, and `\\` a backslash. */
function pipeCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  const text = line.trim().replace(/^\|/, "");
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "\\" && (next === "|" || next === "\\")) {
      cell += next;
      i += 1;
    } else if (c === "|") {
      cells.push(cell);
      cell = "";
    } else cell += c;
  }
  if (cell.trim()) cells.push(cell);
  // <br> in a cell is a line break, as in mark ranges written one per line.
  return cells.map((value) =>
    value
      .trim()
      .replace(/^(\*\*|__)(.*)\1$/, "$2")
      .replace(/\s*<br\s*\/?>\s*/gi, "\n"),
  );
}

const isRowLine = (line: string | undefined) => !!line?.includes("|");
const isDelimiterLine = (line: string | undefined) => {
  if (!isRowLine(line)) return false;
  const cells = pipeCells(line as string);
  return cells.length > 0 && cells.every((cell) => DELIMITER_CELL.test(cell));
};

/** The lines that hold content, leaving out fenced code blocks. */
function contentLines(text: string): string[] {
  let fenced = false;
  return text.split(/\r?\n/).filter((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return false;
    }
    return !fenced;
  });
}

const ANY_HEADING = /^#{1,6}\s+(.+?)\s*#*$/;

/** Each pipe table, with the last heading written since the table before it. */
function pipeTables(lines: readonly string[]): SourcedTable[] {
  const tables: SourcedTable[] = [];
  let heading = "";
  let i = 0;
  while (i < lines.length) {
    if (!isRowLine(lines[i]) || !isDelimiterLine(lines[i + 1])) {
      heading = ANY_HEADING.exec(lines[i].trim())?.[1] ?? heading;
      i += 1;
      continue;
    }
    const rows = [pipeCells(lines[i])];
    i += 2;
    while (i < lines.length && isRowLine(lines[i])) {
      rows.push(pipeCells(lines[i]));
      i += 1;
    }
    tables.push({ rows, heading, source: `Table ${tables.length + 1}` });
    heading = "";
  }
  return tables;
}

/** The heading-and-list layout, as the rows the shared parser reads. A heading whose list names no points is not a criterion. */
function headingTable(lines: readonly string[]): string[][] {
  const rows: string[][] = [];
  let current: string[] | null = null;
  const finish = () => {
    if (current && current.length >= 4) rows.push(current);
    current = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    if (heading) {
      finish();
      const points = HEADING_POINTS.exec(heading[1]);
      current = points ? [points[1], points[2]] : [heading[1], ""];
      continue;
    }
    const level = LIST_LEVEL.exec(line);
    if (level && current) current.push(level[1]);
  }
  finish();
  if (rows.length === 0) return [];
  const columns = Math.max(...rows.map((row) => row.length - 2));
  return [
    [
      "Criterion",
      "Max points",
      ...Array.from({ length: columns }, (_, i) => `Level ${i + 1}`),
    ],
    ...rows,
  ];
}

export function readMarkdownRubrics(bytes: Uint8Array): FoundRubric[] {
  const lines = contentLines(new TextDecoder().decode(bytes));
  const fromTables = rubricsFromTables(pipeTables(lines));
  if (fromTables.length > 0) return fromTables;
  const title = lines
    .map((line) => /^#\s+(.+?)\s*#*$/.exec(line.trim())?.[1])
    .find(Boolean);
  return rubricsFromTables([
    { rows: headingTable(lines), heading: title, source: "Headings and lists" },
  ]);
}
