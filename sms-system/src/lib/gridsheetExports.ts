import type { GridsheetPDFDayRow } from './attendanceGridsheet';
import type { TermDocument } from './firebase';
import {
  aoaToSheet,
  buildExportFilename,
  downloadCSVRaw,
  downloadXLSX,
  setColWidths,
  setMerges,
  type CellRange,
} from './spreadsheetExport';

function monthShort(mk: string): string {
  const [year, month] = mk.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short' });
}

function monthLong(mk: string): string {
  const [year, month] = mk.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── CSV (flattened 2-row header — see ATTENDANCE_SUMMARY_REGISTER_SPEC.md
// §18.2 / §18.4 for why CSV can't represent the XLSX version's merged
// 5-row header) ─────────────────────────────────────────────────────────

export function exportGridsheetCSV(
  rows: GridsheetPDFDayRow[],
  monthKeys: string[],
  term: TermDocument & { id: string },
  className: string,
): void {
  const monthNames = monthKeys.map(monthLong);

  const headerRow = [
    ...monthKeys.map(monthShort),
    'CF',
    ...monthKeys.flatMap((_mk, i) => [
      `${monthNames[i]} Date`,
      `${monthNames[i]} M-AM`,
      `${monthNames[i]} M-PM`,
      `${monthNames[i]} F-AM`,
      `${monthNames[i]} F-PM`,
    ]),
    'Total Males',
    'Total Females',
  ];

  const dataRows = rows.map((row) => {
    const dayStr = String(row.dayNum).padStart(2, '0');
    return [
      ...monthKeys.map((mk) => row.monthDayTotals[mk] ?? ''),
      '',
      ...monthKeys.flatMap((mk) => {
        const s = row.monthSessions[mk];
        return [dayStr, s.malesAM ?? '', s.malesPM ?? '', s.femalesAM ?? '', s.femalesPM ?? ''];
      }),
      row.malesTotal || '',
      row.femalesTotal || '',
    ];
  });

  const csv = [headerRow, ...dataRows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  downloadCSVRaw(buildExportFilename(['summary-register', className, term.name], 'csv'), csv);
}

// ─── XLSX (merged 5-row header — layout per ATTENDANCE_SUMMARY_REGISTER_SPEC.md
// §18.3, generalized here for any term length instead of the spec's fixed
// 4-month worked example) ───────────────────────────────────────────────────

export function exportGridsheetXLSX(
  rows: GridsheetPDFDayRow[],
  monthKeys: string[],
  term: TermDocument & { id: string },
  className: string,
): void {
  const numMonths = monthKeys.length;
  const monthNames = monthKeys.map(monthLong);

  // Column layout (0-indexed):
  //   0..numMonths-1        "Total Attendances" per-month day totals
  //   numMonths              "CF" (Carried Forward)
  //   numMonths+1..          per-month block: Date, M-AM, M-PM, F-AM, F-PM  (5 cols/month)
  //   ...+2                  Total Males, Total Females
  const CF_COL = numMonths;
  const MONTHLY_START = numMonths + 1;
  const monthColStart = (i: number) => MONTHLY_START + i * 5;
  const totalMalesCol = MONTHLY_START + numMonths * 5;
  const totalFemalesCol = totalMalesCol + 1;
  const lastCol = totalFemalesCol;

  const HEADER_ROWS = 5; // rows 0-4; data starts at row 5
  const aoa: (string | number | null)[][] = Array.from({ length: HEADER_ROWS + rows.length }, () =>
    Array(lastCol + 1).fill(null),
  );

  // Row 0 — top-level titles
  aoa[0][0] = 'TOTAL ATTENDANCES (each month of term)';
  aoa[0][CF_COL] = 'TOTAL ATTENDANCES Carried Forward';
  aoa[0][MONTHLY_START] = `MONTHLY SUMMARIES FOR TERM ENDING ${term.endDate}`;
  aoa[0][totalMalesCol] = 'TOTAL';

  // Row 1 — month short-names under the "Total Attendances" block (not enumerated
  // in the source spec's merge table — added here for parity with the CSV
  // version's per-month columns; verify visually against the PDF during QA, per
  // SPREADSHEET_EXPORT_IMPLEMENTATION_PLAN.md §11) + month full-names under each
  // monthly-summary block.
  monthKeys.forEach((mk, i) => {
    aoa[1][i] = monthShort(mk);
    aoa[1][monthColStart(i)] = monthNames[i];
  });

  // Row 2 — "Males" / "Females" group labels per month
  monthKeys.forEach((_mk, i) => {
    aoa[2][monthColStart(i) + 1] = 'Males';
    aoa[2][monthColStart(i) + 3] = 'Females';
  });

  // Row 3 — "Session" label per month (spans the whole 4-session block)
  monthKeys.forEach((_mk, i) => {
    aoa[3][monthColStart(i) + 1] = 'Session';
  });

  // Row 4 — column labels: Date | AM | PM | AM | PM, per month
  monthKeys.forEach((_mk, i) => {
    const c = monthColStart(i);
    aoa[4][c] = 'Date';
    aoa[4][c + 1] = 'AM';
    aoa[4][c + 2] = 'PM';
    aoa[4][c + 3] = 'AM';
    aoa[4][c + 4] = 'PM';
  });

  // Data rows
  rows.forEach((row, ri) => {
    const r = HEADER_ROWS + ri;
    const dayStr = String(row.dayNum).padStart(2, '0');
    monthKeys.forEach((mk, i) => {
      aoa[r][i] = row.monthDayTotals[mk];
      const s = row.monthSessions[mk];
      const c = monthColStart(i);
      aoa[r][c] = dayStr;
      aoa[r][c + 1] = s.malesAM;
      aoa[r][c + 2] = s.malesPM;
      aoa[r][c + 3] = s.femalesAM;
      aoa[r][c + 4] = s.femalesPM;
    });
    aoa[r][totalMalesCol] = row.malesTotal;
    aoa[r][totalFemalesCol] = row.femalesTotal;
  });

  const ws = aoaToSheet(aoa);

  const merges: CellRange[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: numMonths - 1 } },
    { s: { r: 0, c: CF_COL }, e: { r: HEADER_ROWS - 1, c: CF_COL } },
    { s: { r: 0, c: MONTHLY_START }, e: { r: 0, c: totalMalesCol - 1 } },
    { s: { r: 0, c: totalMalesCol }, e: { r: 0, c: totalFemalesCol } },
    { s: { r: 1, c: totalMalesCol }, e: { r: HEADER_ROWS - 1, c: totalMalesCol } },
    { s: { r: 1, c: totalFemalesCol }, e: { r: HEADER_ROWS - 1, c: totalFemalesCol } },
    ...monthKeys.flatMap((_mk, i): CellRange[] => {
      const c = monthColStart(i);
      return [
        { s: { r: 1, c }, e: { r: HEADER_ROWS - 1, c } }, // "Date" column spans rows 1-4
        { s: { r: 1, c: c + 1 }, e: { r: 1, c: c + 4 } }, // month name spans its 4 session cols
        { s: { r: 2, c: c + 1 }, e: { r: 2, c: c + 2 } }, // "Males"
        { s: { r: 2, c: c + 3 }, e: { r: 2, c: c + 4 } }, // "Females"
        { s: { r: 3, c: c + 1 }, e: { r: 3, c: c + 4 } }, // "Session"
      ];
    }),
  ];
  setMerges(ws, merges);
  setColWidths(ws, Array(lastCol + 1).fill(6));

  downloadXLSX(buildExportFilename(['summary-register', className, term.name], 'xlsx'), [
    { name: 'Summary Register', sheet: ws },
  ]);
}
