import * as XLSX from '@e965/xlsx';

// ─── High-level layer — flat tabular data (Results, Report Cards) ──────────

export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// A spreadsheet reads a text cell that starts with = + - @ (or a tab or carriage return) as a
// formula, and the cells hold names and comments that people typed. A leading apostrophe keeps
// such a string as text. Numbers are left alone, so a negative number stays a number.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One quoted CSV cell, with a formula-looking string kept as text. */
export function csvEscape(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function rowsToCSV<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const headerRow = columns.map((c) => csvEscape(c.header));
  const dataRows = rows.map((row) => columns.map((c) => csvEscape(c.accessor(row))));
  return [headerRow, ...dataRows].map((r) => r.join(',')).join('\n');
}

/** For pre-built CSV strings (the Gridsheet's bespoke flattened-header export uses this directly). */
export function downloadCSVRaw(filename: string, csv: string): void {
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

export function downloadCSV<T>(filename: string, rows: T[], columns: ExportColumn<T>[]): void {
  downloadCSVRaw(filename, rowsToCSV(rows, columns));
}

function xlsxCellValue(value: string | number | null | undefined): string | number {
  return value === null || value === undefined ? '' : value;
}

export function rowsToXLSXSheet<T>(rows: T[], columns: ExportColumn<T>[]): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => xlsxCellValue(c.accessor(row)))),
  ];
  return XLSX.utils.aoa_to_sheet(aoa);
}

export function downloadXLSX(filename: string, sheets: { name: string; sheet: XLSX.WorkSheet }[]): void {
  const wb = XLSX.utils.book_new();
  for (const { name, sheet } of sheets) {
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  XLSX.writeFile(wb, filename); // SheetJS handles the Blob/download mechanics itself in a browser context
}

// ─── Low-level layer — hand-built sheets with merges (Gridsheet) ───────────

export function encodeCell(r: number, c: number): string {
  return XLSX.utils.encode_cell({ r, c });
}

export function aoaToSheet(aoa: (string | number | null)[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(aoa);
}

export type CellRange = { s: { r: number; c: number }; e: { r: number; c: number } };

export function setMerges(ws: XLSX.WorkSheet, merges: CellRange[]): void {
  ws['!merges'] = merges;
}

export function setColWidths(ws: XLSX.WorkSheet, widths: number[]): void {
  ws['!cols'] = widths.map((wch) => ({ wch }));
}

// ─── Shared filename helper ─────────────────────────────────────────────────

export function buildExportFilename(parts: (string | null | undefined)[], ext: 'csv' | 'xlsx'): string {
  const joined = parts.filter((p): p is string => Boolean(p && p.trim())).join('-');
  const safe = joined
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${safe || 'export'}.${ext}`;
}
