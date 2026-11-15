import { attr, decode, MAX_INFLATED_BYTES, tokens } from "./docxText";
import { extractEntry, indexZip } from "./docxZip";
import { LIST_MARKER } from "./rubricLevels";
import {
  rubricsFromTables,
  type FoundRubric,
  type SourcedTable,
} from "./rubricFromTable";

// Reads a rubric's grid from the tables in a Word file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.4). The exam
// reader deliberately skips tables, so this has its own walk over the same XML tokens. Only top-level tables count: a table
// within a table is ignored. Deleted text and the fallback copies Word keeps for older versions are skipped. A cell spanning
// columns or rows repeats its text, so each row keeps its columns. A cell keeps its paragraphs as lines, and a paragraph that is
// a list item starts with LIST_MARKER, so a list item wrapped over two paragraphs can be joined back up (rubricLayouts.ts).

const MAX_TABLES = 50;
const MAX_ROWS = 2000;
const MAX_COLUMNS = 50;
const SKIPPED = new Set(["w:del", "w:moveFrom", "mc:Fallback"]);

type Cell = {
  text: string;
  span: number;
  continues: boolean;
  /** The cell's finished lines, the paragraph being read, and whether it is a list item. */
  lines: string[];
  line: string;
  listItem: boolean;
};

const newCell = (): Cell => ({
  text: "",
  span: 1,
  continues: false,
  lines: [],
  line: "",
  listItem: false,
});

/** Ends the paragraph being read in a cell, keeping it as a line when it has text. */
function endLine(cell: Cell): void {
  const text = cell.line.replace(/\s+/g, " ").trim();
  if (text) cell.lines.push(cell.listItem ? `${LIST_MARKER}${text}` : text);
  cell.line = "";
  cell.listItem = false;
}

function placeRow(cells: readonly Cell[], above: readonly string[]): string[] {
  const row: string[] = [];
  for (const cell of cells) {
    const column = row.length;
    const text = cell.continues ? (above[column] ?? "") : cell.text;
    for (let i = 0; i < cell.span && row.length < MAX_COLUMNS; i += 1)
      row.push(text);
  }
  return row;
}

type Walk = {
  rows: string[][];
  cells: Cell[];
  cell: Cell | null;
  inText: boolean;
  /** How deep the walk is inside tables, and inside parts that are skipped. */
  depth: number;
  skipping: number;
  /** The paragraph being read outside any table, and the last one with text: a table's heading. */
  paragraph: string;
  lastParagraph: string;
};

function closeInTable(walk: Walk, name: string): void {
  if (name === "w:t") walk.inText = false;
  else if (name === "w:p" && walk.cell) endLine(walk.cell);
  else if (name === "w:tc" && walk.cell) {
    endLine(walk.cell);
    walk.cell.text = walk.cell.lines.join("\n");
    walk.cells.push(walk.cell);
    walk.cell = null;
  } else if (name === "w:tr" && walk.rows.length < MAX_ROWS) {
    walk.rows.push(placeRow(walk.cells, walk.rows[walk.rows.length - 1] ?? []));
    walk.cells = [];
  }
}

function applyToCell(cell: Cell, name: string, attrs: string): void {
  if (name === "w:br" || name === "w:tab") cell.line += " ";
  else if (name === "w:numPr") cell.listItem = true;
  else if (name === "w:gridSpan")
    cell.span = Math.max(1, Number(attr(attrs, "w:val")) || 1);
  else if (name === "w:vMerge")
    cell.continues = attr(attrs, "w:val") !== "restart";
}

function openInTable(
  walk: Walk,
  name: string,
  attrs: string,
  selfClosing: boolean,
): void {
  if (name === "w:tr") walk.cells = [];
  else if (name === "w:tc") walk.cell = newCell();
  else if (name === "w:t") walk.inText = !selfClosing;
  else if (walk.cell) applyToCell(walk.cell, name, attrs);
}

/** A nesting count over a tag's opening and closing: how deep the walk is inside that tag. */
const nested = (depth: number, closing: boolean, selfClosing: boolean) => {
  if (closing) return Math.max(0, depth - 1);
  return selfClosing ? depth : depth + 1;
};

type Tag =
  | { kind: "open"; name: string; attrs: string; selfClosing: boolean }
  | { kind: "close"; name: string };

/** Outside tables, only paragraphs matter: the last one with text before a table is its heading. */
function applyOutside(walk: Walk, t: Tag): void {
  if (t.name === "w:t") walk.inText = t.kind === "open" && !t.selfClosing;
  else if (t.name === "w:p" && t.kind === "close") {
    const text = walk.paragraph.replace(/\s+/g, " ").trim();
    if (text) walk.lastParagraph = text;
    walk.paragraph = "";
  }
}

function applyTag(walk: Walk, tables: SourcedTable[], t: Tag): void {
  const closing = t.kind === "close";
  const selfClosing = t.kind === "open" && t.selfClosing;
  if (SKIPPED.has(t.name)) {
    walk.skipping = nested(walk.skipping, closing, selfClosing);
  } else if (t.name === "w:tbl") {
    const heading = walk.lastParagraph;
    if (walk.depth === 0 && !closing) walk.rows = [];
    walk.depth = nested(walk.depth, closing, selfClosing);
    if (walk.depth === 0 && closing && tables.length < MAX_TABLES) {
      tables.push({
        rows: walk.rows,
        heading,
        source: `Table ${tables.length + 1}`,
      });
      walk.lastParagraph = "";
    }
  } else if (walk.depth === 0) {
    applyOutside(walk, t);
  } else if (walk.depth === 1) {
    if (t.kind === "close") closeInTable(walk, t.name);
    else openInTable(walk, t.name, t.attrs, t.selfClosing);
  }
}

function addText(walk: Walk, text: string): void {
  if (!walk.inText || walk.skipping) return;
  if (walk.depth === 0) walk.paragraph += decode(text);
  else if (walk.depth === 1 && walk.cell) walk.cell.line += decode(text);
}

/** Every top-level table, with the paragraph above it. Exported for the tests. */
export function docxSourcedTables(xml: string): SourcedTable[] {
  const tables: SourcedTable[] = [];
  const walk: Walk = {
    rows: [],
    cells: [],
    cell: null,
    inText: false,
    depth: 0,
    skipping: 0,
    paragraph: "",
    lastParagraph: "",
  };
  for (const t of tokens(xml)) {
    if (t.kind === "text") addText(walk, t.text);
    else applyTag(walk, tables, t);
  }
  return tables;
}

/** Every top-level table's rows of text. Exported for the tests. */
export const docxTables = (xml: string): string[][][] =>
  docxSourcedTables(xml).map((table) => table.rows as string[][]);

export function readWordRubrics(bytes: Uint8Array): FoundRubric[] {
  const entry = indexZip(bytes).get("word/document.xml");
  if (!entry) return [];
  const xml = new TextDecoder().decode(
    extractEntry(bytes, entry, MAX_INFLATED_BYTES),
  );
  return rubricsFromTables(docxSourcedTables(xml));
}
