import { describe, it, expect } from 'vitest';
import { rowsToCSV, rowsToXLSXSheet, buildExportFilename, type ExportColumn } from '../spreadsheetExport';

type Row = { name: string; score: number | null };
const columns: ExportColumn<Row>[] = [
  { header: 'Name', accessor: (r) => r.name },
  { header: 'Score', accessor: (r) => r.score },
];

describe('rowsToCSV', () => {
  it('writes a header-only CSV for an empty row set', () => {
    expect(rowsToCSV([], columns)).toBe('"Name","Score"');
  });

  it('stringifies values and joins with commas', () => {
    const csv = rowsToCSV([{ name: 'Ada', score: 95 }], columns);
    expect(csv).toBe('"Name","Score"\n"Ada","95"');
  });

  it('escapes embedded quotes and commas', () => {
    const csv = rowsToCSV([{ name: 'Smith, "Ace"', score: null }], columns);
    expect(csv).toContain('"Smith, ""Ace"""');
  });

  it('renders null/undefined as an empty cell', () => {
    const csv = rowsToCSV([{ name: 'Ada', score: null }], columns);
    expect(csv.split('\n')[1]).toBe('"Ada",""');
  });
});

describe('rowsToXLSXSheet', () => {
  it('places header and values at expected cell addresses', () => {
    const ws = rowsToXLSXSheet([{ name: 'Ada', score: 95 }], columns);
    expect(ws['A1'].v).toBe('Name');
    expect(ws['B1'].v).toBe('Score');
    expect(ws['A2'].v).toBe('Ada');
    expect(ws['B2'].v).toBe(95);
  });

  it('sizes the sheet range to the row/column count', () => {
    const ws = rowsToXLSXSheet(
      [{ name: 'Ada', score: 1 }, { name: 'Bo', score: 2 }],
      columns,
    );
    expect(ws['!ref']).toBe('A1:B3'); // 1 header row + 2 data rows, 2 columns
  });
});

describe('buildExportFilename', () => {
  it('joins non-empty parts with hyphens and lowercases', () => {
    expect(buildExportFilename(['Results', 'Grade 10B', '2026'], 'csv')).toBe('results-grade-10b-2026.csv');
  });

  it('skips null/undefined parts', () => {
    expect(buildExportFilename(['results', null, undefined, 'all-terms'], 'xlsx')).toBe('results-all-terms.xlsx');
  });

  it('strips unsafe filename characters', () => {
    expect(buildExportFilename(['a/b:c*d'], 'csv')).toBe('abcd.csv');
  });
});
