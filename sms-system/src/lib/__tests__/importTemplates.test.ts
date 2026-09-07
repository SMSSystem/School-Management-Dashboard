import { describe, it, expect, vi } from 'vitest';
import { parseRows, downloadImportTemplate, type ImportColumn } from '../spreadsheetImport';
import * as spreadsheetExport from '../spreadsheetExport';
import { resultsImportColumns, resultsImportExampleRow } from '../importResults';
import { mddsImportColumns, mddsImportExampleRow } from '../importMdds';
import { gradebookImportColumns, gradebookImportExampleRow } from '../importGradebook';
import { generalAttendanceImportColumns, generalAttendanceImportExampleRow } from '../importGeneralAttendance';
import { subjectAttendanceImportColumns, subjectAttendanceImportExampleRow } from '../importSubjectAttendance';

// §13: "generated from the same ImportColumn<T> definitions the parser
// itself validates against, so the template and the actual accepted
// format can never drift apart." These tests are the guard for that claim
// — each example row is round-tripped through the real parseRows() the
// upload step uses, not just eyeballed for plausibility.

const targets: [string, ImportColumn<never>[], Record<string, string | number>][] = [
  ['results', resultsImportColumns as ImportColumn<never>[], resultsImportExampleRow],
  ['mdds', mddsImportColumns as ImportColumn<never>[], mddsImportExampleRow],
  ['gradebook', gradebookImportColumns as ImportColumn<never>[], gradebookImportExampleRow],
  ['general_attendance', generalAttendanceImportColumns as ImportColumn<never>[], generalAttendanceImportExampleRow],
  ['subject_attendance', subjectAttendanceImportColumns as ImportColumn<never>[], subjectAttendanceImportExampleRow],
];

describe('per-target §13 example rows', () => {
  it.each(targets)('%s: example row parses with zero errors against its own columns', (_name, columns, exampleRow) => {
    const { rows, errors } = parseRows([exampleRow], columns);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});

describe('downloadImportTemplate', () => {
  it('passes the header row and the example row through to downloadCSV', () => {
    const spy = vi.spyOn(spreadsheetExport, 'downloadCSV').mockImplementation(() => {});
    downloadImportTemplate('import-template-results', resultsImportColumns, resultsImportExampleRow, 'csv');

    expect(spy).toHaveBeenCalledOnce();
    const [filename, rows, columns] = spy.mock.calls[0];
    expect(filename).toBe('import-template-results-template.csv');
    expect(rows).toEqual([resultsImportExampleRow]);
    expect(columns.map((c) => c.header)).toEqual(resultsImportColumns.map((c) => c.header));
    expect(columns.map((c) => c.accessor(resultsImportExampleRow))).toEqual(
      resultsImportColumns.map((c) => resultsImportExampleRow[c.header]),
    );

    spy.mockRestore();
  });

  it('routes to downloadXLSX, not downloadCSV, for the xlsx format', () => {
    const csvSpy = vi.spyOn(spreadsheetExport, 'downloadCSV').mockImplementation(() => {});
    const xlsxSpy = vi.spyOn(spreadsheetExport, 'downloadXLSX').mockImplementation(() => {});
    downloadImportTemplate('import-template-mdds', mddsImportColumns, mddsImportExampleRow, 'xlsx');

    expect(csvSpy).not.toHaveBeenCalled();
    expect(xlsxSpy).toHaveBeenCalledOnce();
    const [filename, sheets] = xlsxSpy.mock.calls[0];
    expect(filename).toBe('import-template-mdds-template.xlsx');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('Template');

    csvSpy.mockRestore();
    xlsxSpy.mockRestore();
  });
});
