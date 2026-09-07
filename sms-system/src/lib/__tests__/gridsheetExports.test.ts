import { describe, it, expect, vi } from 'vitest';
import { exportGridsheetXLSX } from '../gridsheetExports';
import type { GridsheetPDFDayRow } from '../attendanceGridsheet';
import * as spreadsheetExport from '../spreadsheetExport';

// exportGridsheetXLSX triggers a real browser download (via downloadXLSX) as its
// last step — same "not tested" boundary the plan draws for downloadCSV/
// downloadXLSX generally (SPREADSHEET_EXPORT_IMPLEMENTATION_PLAN.md §8/§12).
// Spy on downloadXLSX to capture the worksheet it was called with instead.
const fixtureRows: GridsheetPDFDayRow[] = [
  {
    dayNum: 1,
    monthDayTotals: { '2026-09': 10, '2026-10': null },
    monthSessions: {
      '2026-09': { malesAM: 3, malesPM: 2, femalesAM: 3, femalesPM: 2 },
      '2026-10': { malesAM: null, malesPM: null, femalesAM: null, femalesPM: null },
    },
    malesTotal: 5,
    femalesTotal: 5,
  },
];

const fixtureTerm = { id: 't1', name: 'Term 1', startDate: '2026-09-01', endDate: '2026-12-15' } as never;

describe('exportGridsheetXLSX', () => {
  it('builds a sheet with the expected merge ranges for a 2-month term', () => {
    const spy = vi.spyOn(spreadsheetExport, 'downloadXLSX').mockImplementation(() => {});

    exportGridsheetXLSX(fixtureRows, ['2026-09', '2026-10'], fixtureTerm, 'Grade 10B');

    expect(spy).toHaveBeenCalledOnce();
    const [, sheets] = spy.mock.calls[0];
    const ws = sheets[0].sheet;

    // "Total Attendances" title spans the 2 month columns (cols 0-1)
    expect(ws['!merges']).toContainEqual({ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } });
    expect(ws['A1'].v).toBe('TOTAL ATTENDANCES (each month of term)');

    spy.mockRestore();
  });

  it('writes per-month header rows and data rows at the expected addresses', () => {
    const spy = vi.spyOn(spreadsheetExport, 'downloadXLSX').mockImplementation(() => {});

    exportGridsheetXLSX(fixtureRows, ['2026-09', '2026-10'], fixtureTerm, 'Grade 10B');

    const [, sheets] = spy.mock.calls[0];
    const ws = sheets[0].sheet;

    // Column layout: 0-1 = month totals, 2 = CF, 3-7 = Sept block (Date,M-AM,M-PM,F-AM,F-PM), 8-12 = Oct block, 13-14 = totals
    // Row 1 (0-indexed) month short-name under the totals block
    expect(ws['A2'].v).toBe('Sep');
    // Row 4 (0-indexed) column labels for the September block start at col D (index 3)
    expect(ws['D5'].v).toBe('Date');
    expect(ws['E5'].v).toBe('AM');
    // First data row (row index 5) — day total for September
    expect(ws['A6'].v).toBe(10);
    expect(ws['D6'].v).toBe('01');
    expect(ws['E6'].v).toBe(3); // malesAM

    spy.mockRestore();
  });

  it('calls downloadXLSX with a filename built from class and term name', () => {
    const spy = vi.spyOn(spreadsheetExport, 'downloadXLSX').mockImplementation(() => {});

    exportGridsheetXLSX(fixtureRows, ['2026-09'], fixtureTerm, 'Grade 10B');

    const [filename] = spy.mock.calls[0];
    expect(filename).toBe('summary-register-grade-10b-term-1.xlsx');

    spy.mockRestore();
  });
});
