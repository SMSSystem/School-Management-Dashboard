import { extractEntry, indexZip } from "./docxZip";
import { csvCells } from "./rubricFile";
import { rubricsFromTables, type FoundRubric } from "./rubricFromTable";

// Reads a rubric's grid from a spreadsheet (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.4). A CSV needs no library,
// so the spreadsheet library loads only for an Excel file. Cells come back as the text the sheet shows, and a formula is never
// run. Every visible sheet is looked at, and only the sheets that hold a rubric give one, so a sheet of names and marks is never
// read (D18).

/** The most a workbook may inflate to. SheetJS has no limit of its own (section 13.1). */
const MAX_INFLATED_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 2000;
const MAX_COLUMNS = 50;

export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const { row, value } of csvCells(text)) {
    (rows[row - 1] ??= []).push(value);
  }
  return Array.from(rows, (cells) => cells ?? []);
}

export function readCsvRubrics(bytes: Uint8Array): FoundRubric[] {
  return rubricsFromTables([
    { rows: csvRows(new TextDecoder().decode(bytes)), source: "The file" },
  ]);
}

/**
 * Throws if the workbook inflates past the limit. Each part is really inflated under a cap, because the sizes a zip declares
 * can be false, and a small file can inflate to a very large one.
 */
function assertInflatesWithinLimit(bytes: Uint8Array): void {
  let remaining = MAX_INFLATED_BYTES;
  for (const entry of indexZip(bytes).values())
    remaining -= extractEntry(bytes, entry, remaining).length;
}

type Xlsx = typeof import("@e965/xlsx");
type WorkSheet = import("@e965/xlsx").WorkSheet;

/** The sheet's cells as the text it shows, kept to the limits. */
function sheetRows(XLSX: Xlsx, sheet: WorkSheet, ref: string): string[][] {
  const { s: start, e: end } = XLSX.utils.decode_range(ref);
  const lastRow = Math.min(end.r, start.r + MAX_ROWS - 1);
  const lastColumn = Math.min(end.c, start.c + MAX_COLUMNS - 1);
  const rows: string[][] = [];
  for (let r = start.r; r <= lastRow; r += 1) {
    const cells: string[] = [];
    for (let c = start.c; c <= lastColumn; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as
        | Parameters<Xlsx["utils"]["format_cell"]>[0]
        | undefined;
      cells.push(cell ? XLSX.utils.format_cell(cell) : "");
    }
    rows.push(cells);
  }
  fillMerges(rows, sheet, start);
  return rows;
}

/** Merged cells come back empty, so each one takes the text of its first cell. */
function fillMerges(
  rows: string[][],
  sheet: WorkSheet,
  start: { r: number; c: number },
): void {
  for (const merge of sheet["!merges"] ?? []) {
    const text = rows[merge.s.r - start.r]?.[merge.s.c - start.c] ?? "";
    const lastRow = Math.min(merge.e.r - start.r, rows.length - 1);
    for (let r = merge.s.r - start.r; r <= lastRow; r += 1) {
      const lastColumn = Math.min(merge.e.c - start.c, rows[r].length - 1);
      for (let c = merge.s.c - start.c; c <= lastColumn; c += 1)
        rows[r][c] = text;
    }
  }
}

/** The most sheets looked at in one workbook. */
const MAX_SHEETS = 50;

export async function readExcelRubrics(
  bytes: Uint8Array,
): Promise<FoundRubric[]> {
  assertInflatesWithinLimit(bytes);
  const XLSX = await import("@e965/xlsx");
  const book = XLSX.read(bytes, { type: "array" });
  const details = book.Workbook?.Sheets ?? [];
  const tables = book.SheetNames.filter((_, i) => !details[i]?.Hidden)
    .slice(0, MAX_SHEETS)
    .flatMap((name) => {
      const sheet = book.Sheets[name];
      const ref = sheet?.["!ref"];
      return sheet && ref
        ? [
            {
              rows: sheetRows(XLSX, sheet, ref),
              heading: name,
              source: `Sheet “${name}”`,
            },
          ]
        : [];
    });
  return rubricsFromTables(tables);
}
