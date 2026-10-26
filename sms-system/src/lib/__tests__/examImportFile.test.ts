import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as XLSX from '@e965/xlsx';
import { describe, expect, it } from 'vitest';
import { readExamFile } from '../examImportFile';
import { EXAM_IMPORT_HEADERS, examTemplateRows } from '../examImport';
import { rowsToCSV } from '../spreadsheetExport';
import ExamImportDialog from '../../components/exam/builder/ExamImportDialog';
import ImportWarningsBanner from '../../components/exam/builder/ImportWarningsBanner';
import pageRaw from '../../scenes/(dashboard)/list/exams/build/index.tsx?raw';
import dialogRaw from '../../components/exam/builder/ExamImportDialog.tsx?raw';
import menuRaw from '../../components/exam/builder/TemplateMenu.tsx?raw';

// Reading a chosen file into questions (EXAMS_FEATURE_SPEC.md §4.4), and the import dialog around it.

const norm = (s: string) => s.split('\r\n').join('\n');
const page = norm(pageRaw);

const columns = EXAM_IMPORT_HEADERS.map((header) => ({ header, accessor: (row: Record<string, string | number>) => row[header] ?? '' }));
const csvFile = (text: string, name = 'questions.csv') => new File([text], name, { type: 'text/csv' });

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

  it('refuses a file that is not a spreadsheet, without reading it', async () => {
    await expect(readExamFile(new File(['x'], 'quiz.json'), 'single')).rejects.toThrow('Choose a CSV, Excel');
  });
});

describe('ExamImportDialog', () => {
  const html = renderToStaticMarkup(
    createElement(ExamImportDialog, { answerMode: 'both', existingCount: 3, onApply: () => undefined, onClose: () => undefined }),
  );

  it('explains the template and the Word and PDF layout, and accepts spreadsheets, Word and PDF files', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Import questions from a file');
    for (const header of EXAM_IMPORT_HEADERS) expect(html).toContain(header);
    expect(html).toContain('accept=".csv,.xlsx,.docx,.pdf,.md,.markdown"');
    expect(html).toContain('Choose a CSV, Excel, Word, PDF or Markdown file');
    expect(html).toContain('Word, PDF and Markdown files: the layout to use');
    expect(html).toContain('Answers: A, C');
    expect(html).toContain('Download template');
    expect(html).not.toContain('Download an example Word file');
    expect(html).toContain('the file itself is not kept');
  });

  it('says where a Word picture goes, what is read, that the pictures are reviewed and that only Word imports them yet', () => {
    expect(html).toContain('Pictures (Word and PDF files).');
    expect(html).toContain('under the question text and before the first option');
    expect(html).toContain('A question keeps one picture.');
    expect(html).toContain('PNG, JPEG');
    expect(html).toContain('EMF/WMF');
    expect(html).toContain('you use, move or remove each one');
    expect(html).toContain('Pictures in Markdown files are not imported yet');
    expect(html).toContain('a figure drawn with shapes is not a picture');
    expect(html).toContain('Tables and text boxes are ignored');
    expect(html).not.toContain('Tables, pictures and text boxes are ignored');
    expect(html).toContain('A Word or');
    expect(html).toContain('a step lets you check where each picture goes');
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
    expect(page).toContain('b.applyImported(merged.questions, placed)');
    expect(page).not.toMatch(/setDoc|updateDoc|addDoc|writeBatch/);
  });

  it('keeps every reader behind a dynamic import: the dialog loads only the small router, and the router the reader for the file chosen', () => {
    const dialog = norm(dialogRaw);
    expect(dialog).toContain('await import("@/lib/examImportRead")');
    // the template menu loads the spreadsheet and the template makers, each when its entry is chosen
    const menu = norm(menuRaw);
    expect(menu).toContain('await import("@/lib/examImportFile")');
    expect(menu).toContain('await import("@/lib/examImportRead")');
    expect(dialog).not.toMatch(/^import .*TemplateMenu.*examImport/m);
    expect(dialog).not.toMatch(/^import .*(examImportFile|examImportRead|examDocx|examPdf|exampleDocx)/m);
  });
});
