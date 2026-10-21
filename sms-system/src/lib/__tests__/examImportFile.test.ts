import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, fileProblem, readExamFile } from '../examImportFile';
import { EXAM_IMPORT_HEADERS, examTemplateRows } from '../examImport';
import { rowsToCSV } from '../spreadsheetExport';
import ExamImportDialog from '../../components/exam/builder/ExamImportDialog';
import ImportWarningsBanner from '../../components/exam/builder/ImportWarningsBanner';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import dialogRaw from '../../components/exam/builder/ExamImportDialog.tsx?raw';

// Reading a chosen file into questions (EXAMS_FEATURE_SPEC.md §4.4), and the import dialog around it.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);

const columns = EXAM_IMPORT_HEADERS.map((header) => ({ header, accessor: (row: Record<string, string | number>) => row[header] ?? '' }));
const csvFile = (text: string, name = 'questions.csv') => new File([text], name, { type: 'text/csv' });

describe('fileProblem', () => {
  it('accepts CSV and Excel files up to 2 MB', () => {
    expect(fileProblem({ name: 'Quiz.CSV', size: 1000 })).toBeNull();
    expect(fileProblem({ name: 'quiz.xlsx', size: MAX_IMPORT_BYTES })).toBeNull();
  });

  it('says Word and PDF are not supported yet, and refuses other types and large files', () => {
    expect(fileProblem({ name: 'quiz.docx', size: 10 })).toContain('Word and PDF');
    expect(fileProblem({ name: 'quiz.pdf', size: 10 })).toContain('Word and PDF');
    expect(fileProblem({ name: 'quiz.json', size: 10 })).toContain('CSV or Excel');
    expect(fileProblem({ name: 'quiz.xlsx', size: MAX_IMPORT_BYTES + 1 })).toContain('2 MB');
  });
});

describe('readExamFile', () => {
  it('reads the downloadable CSV template back into the three example questions', async () => {
    const csv = rowsToCSV(examTemplateRows(), columns);
    const result = await readExamFile(csvFile(csv), 'both');
    expect(result.missingHeaders).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.questions.map((q) => q.kind)).toEqual(['single', 'multiple', 'single']);
    expect(result.questions[1].points).toBe(2);
  });

  it('reads an Excel file made from the template', async () => {
    const sheet = XLSX.utils.json_to_sheet(examTemplateRows(), { header: [...EXAM_IMPORT_HEADERS] });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Questions');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    const file = new File([bytes], 'questions.xlsx');
    const result = await readExamFile(file, 'both');
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0].options.map((o) => o.text)).toEqual(['Venus', 'Mars', 'Jupiter', 'Mercury']);
  });

  it('reports a file without the needed columns', async () => {
    const result = await readExamFile(csvFile('Name,Score\nAnn,5\n'), 'single');
    expect(result.questions).toEqual([]);
    expect(result.missingHeaders).toEqual(['Question', 'Option A', 'Option B', 'Correct']);
  });

  it('refuses a file type it cannot read, without reading it', async () => {
    await expect(readExamFile(new File(['x'], 'quiz.docx'), 'single')).rejects.toThrow('Word and PDF');
  });
});

describe('ExamImportDialog', () => {
  const html = renderToStaticMarkup(
    createElement(ExamImportDialog, { answerMode: 'both', existingCount: 3, onApply: () => undefined, onClose: () => undefined }),
  );

  it('explains the template, accepts only CSV and Excel, and says Word and PDF are not available yet', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Import questions from a file');
    for (const header of EXAM_IMPORT_HEADERS) expect(html).toContain(header);
    expect(html).toContain('accept=".csv,.xlsx"');
    expect(html).toContain('Word and PDF files cannot be imported yet.');
    expect(html).toContain('Download template');
    expect(html).toContain('the file itself is not kept');
  });

  it('cannot apply until a file with questions has been read', () => {
    expect(html).toMatch(/disabled=""[^>]*>Review in the builder|Review in the builder<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Review in the builder/);
  });
});

describe('ImportWarningsBanner', () => {
  it('lists the warnings with their rows, and shows nothing when there are none', () => {
    const html = renderToStaticMarkup(
      createElement(ImportWarningsBanner, {
        warnings: [{ row: 4, message: 'No correct answer is given.' }, { message: 'Only the first 100 questions were read.' }],
        onDismiss: () => undefined,
      }),
    );
    expect(html).toContain('2 things to check from the import');
    expect(html).toContain('Row 4: No correct answer is given.');
    expect(html).toContain('Only the first 100 questions were read.');
    expect(renderToStaticMarkup(createElement(ImportWarningsBanner, { warnings: [], onDismiss: () => undefined }))).toBe('');
  });
});

describe('the builder page and the import', () => {
  it('offers the import only in full mode and loads the spreadsheet code only inside the dialog', () => {
    expect(page).toContain('{full && (\n              <button type="button" onClick={() => setImporting(true)}');
    expect(page).not.toContain('examImportFile');
    expect(norm(pageRaw)).not.toContain('@e965/xlsx');
  });

  it('puts the imported questions into the unsaved list, through mergeImported, and saves nothing itself', () => {
    expect(page).toContain('mergeImported(draft, result.questions, how)');
    expect(page).toContain('b.setDraft(merged.questions)');
    expect(page).not.toMatch(/setDoc|updateDoc|addDoc|writeBatch/);
  });

  it('keeps the dialog’s spreadsheet code behind a dynamic import', () => {
    const dialog = norm(dialogRaw);
    expect(dialog).toContain('await import("@/lib/examImportFile")');
    expect(dialog).not.toMatch(/^import .*examImportFile/m);
  });
});
