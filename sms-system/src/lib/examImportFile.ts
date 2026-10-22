import type { ExamAnswerMode } from '@/types/exams';
import { EXAM_IMPORT_HEADERS, examTemplateRows, questionsFromRows, type ImportResult } from './examImport';
import { fileProblem } from './examImportKinds';
import { downloadCSV, downloadXLSX, rowsToXLSXSheet, type ExportColumn } from './spreadsheetExport';
import { parseSpreadsheetFile } from './spreadsheetImport';

// The file side of the exam import (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): the downloadable template
// and reading a chosen file in the browser. The file is read and then forgotten: nothing is uploaded or stored.
// This module pulls in the spreadsheet library, so the builder loads it only when the import dialog is opened.

const columns: ExportColumn<Record<string, string | number>>[] = EXAM_IMPORT_HEADERS.map((header) => ({
  header,
  accessor: (row) => row[header] ?? '',
}));

export function downloadExamTemplate(format: 'csv' | 'xlsx'): void {
  const rows = examTemplateRows();
  if (format === 'csv') downloadCSV('exam-questions-template.csv', rows, columns);
  else downloadXLSX('exam-questions-template.xlsx', [{ name: 'Questions', sheet: rowsToXLSXSheet(rows, columns) }]);
}

/** Reads a CSV or Excel file with the template's columns into builder questions and warnings. */
export async function readExamFile(file: File, answerMode: ExamAnswerMode | undefined): Promise<ImportResult> {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  let rows;
  try {
    rows = await parseSpreadsheetFile(file);
  } catch {
    throw new Error('That file could not be read. Check that it is a CSV or Excel file made from the template.');
  }
  return questionsFromRows(rows, answerMode);
}
