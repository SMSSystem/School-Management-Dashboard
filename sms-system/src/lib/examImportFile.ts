import type { ExamAnswerMode } from '@/types/exams';
import { EXAM_IMPORT_HEADERS, examTemplateRows, questionsFromRows, type ImportResult } from './examImport';
import { downloadCSV, downloadXLSX, rowsToXLSXSheet, type ExportColumn } from './spreadsheetExport';
import { parseSpreadsheetFile } from './spreadsheetImport';

// The file side of the exam import (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): the downloadable template
// and reading a chosen file in the browser. The file is read and then forgotten: nothing is uploaded or stored.
// This module pulls in the spreadsheet library, so the builder loads it only when the import dialog is opened.

/** The largest file the import accepts; a hundred questions are a few hundred kilobytes at most. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const columns: ExportColumn<Record<string, string | number>>[] = EXAM_IMPORT_HEADERS.map((header) => ({
  header,
  accessor: (row) => row[header] ?? '',
}));

export function downloadExamTemplate(format: 'csv' | 'xlsx'): void {
  const rows = examTemplateRows();
  if (format === 'csv') downloadCSV('exam-questions-template.csv', rows, columns);
  else downloadXLSX('exam-questions-template.xlsx', [{ name: 'Questions', sheet: rowsToXLSXSheet(rows, columns) }]);
}

/** Why a file cannot be read at all, or null when it can be tried. */
export function fileProblem(file: { name: string; size: number }): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.pdf')) {
    return 'Word and PDF files cannot be imported yet. Use the spreadsheet template (CSV or Excel).';
  }
  if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) return 'Choose a CSV or Excel (.xlsx) file.';
  if (file.size > MAX_IMPORT_BYTES) return 'That file is larger than 2 MB. An exam of 100 questions is much smaller.';
  return null;
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
