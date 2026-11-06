import { attr, decode, MAX_INFLATED_BYTES, tokens } from "./docxText";
import { extractEntry, indexZip } from "./docxZip";
import { rubricFromTables, type RubricGridRead } from "./rubricFromTable";

// Reads a rubric's grid from the tables in a Word file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.4). The exam
// reader deliberately skips tables, so this has its own walk over the same XML tokens. Only top-level tables count: a table
// within a table is ignored. Deleted text and the fallback copies Word keeps for older versions are skipped. A cell spanning
// columns or rows repeats its text, so each row keeps its columns.

const MAX_TABLES = 50;
const MAX_ROWS = 2000;
const MAX_COLUMNS = 50;
const SKIPPED = new Set(["w:del", "w:moveFrom", "mc:Fallback"]);

type Cell = { text: string; span: number; continues: boolean };

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
};

function closeInTable(walk: Walk, name: string): void {
  if (name === "w:t") walk.inText = false;
  else if (name === "w:p" && walk.cell) walk.cell.text += " ";
  else if (name === "w:tc" && walk.cell) {
    walk.cells.push(walk.cell);
    walk.cell = null;
  } else if (name === "w:tr" && walk.rows.length < MAX_ROWS) {
    walk.rows.push(placeRow(walk.cells, walk.rows[walk.rows.length - 1] ?? []));
    walk.cells = [];
  }
}

function applyToCell(cell: Cell, name: string, attrs: string): void {
  if (name === "w:br" || name === "w:tab") cell.text += " ";
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
  else if (name === "w:tc") walk.cell = { text: "", span: 1, continues: false };
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

function applyTag(walk: Walk, tables: string[][][], t: Tag): void {
  const closing = t.kind === "close";
  const selfClosing = t.kind === "open" && t.selfClosing;
  if (SKIPPED.has(t.name)) {
    walk.skipping = nested(walk.skipping, closing, selfClosing);
  } else if (t.name === "w:tbl") {
    if (walk.depth === 0 && !closing) walk.rows = [];
    walk.depth = nested(walk.depth, closing, selfClosing);
    if (walk.depth === 0 && closing && tables.length < MAX_TABLES)
      tables.push(walk.rows);
  } else if (walk.depth === 1) {
    if (t.kind === "close") closeInTable(walk, t.name);
    else openInTable(walk, t.name, t.attrs, t.selfClosing);
  }
}

/** Every top-level table's rows of text. Exported for the tests. */
export function docxTables(xml: string): string[][][] {
  const tables: string[][][] = [];
  const walk: Walk = {
    rows: [],
    cells: [],
    cell: null,
    inText: false,
    depth: 0,
    skipping: 0,
  };
  for (const t of tokens(xml)) {
    if (t.kind !== "text") applyTag(walk, tables, t);
    else if (walk.inText && walk.cell && walk.depth === 1 && !walk.skipping)
      walk.cell.text += decode(t.text);
  }
  return tables;
}

export function readWordGrid(bytes: Uint8Array): RubricGridRead {
  const entry = indexZip(bytes).get("word/document.xml");
  if (!entry) return { criteria: [], warnings: [] };
  const xml = new TextDecoder().decode(
    extractEntry(bytes, entry, MAX_INFLATED_BYTES),
  );
  return rubricFromTables(docxTables(xml));
}
