import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES, MAX_IMPORT_BYTES, fileProblem, importKind } from '../examImportKinds';
import { readImportFile } from '../examImportRead';
import { buildExampleDocx } from '../exampleDocx';
import { examTemplateRows } from '../examImport';
import { rowsToCSV } from '../spreadsheetExport';

// Which files the exam import takes and how the dialog hands each to its reader (EXAMS_FEATURE_SPEC.md §4.4).

describe('importKind', () => {
  it('names the kind by the file’s extension, in any case', () => {
    expect(importKind('Quiz.CSV')).toBe('sheet');
    expect(importKind('quiz.xlsx')).toBe('sheet');
    expect(importKind('Exam 1.DOCX')).toBe('word');
    expect(importKind('exam.pdf')).toBe('pdf');
    expect(importKind('exam.doc')).toBeNull();
    expect(importKind('exam.json')).toBeNull();
    expect(importKind('noextension')).toBeNull();
  });
});

describe('fileProblem', () => {
  it('accepts spreadsheets up to 2 MB and Word and PDF files up to 5 MB', () => {
    expect(fileProblem({ name: 'quiz.csv', size: MAX_IMPORT_BYTES })).toBeNull();
    expect(fileProblem({ name: 'quiz.docx', size: MAX_DOCUMENT_BYTES })).toBeNull();
    expect(fileProblem({ name: 'quiz.pdf', size: 4_000_000 })).toBeNull();
    expect(fileProblem({ name: 'quiz.xlsx', size: MAX_IMPORT_BYTES + 1 })).toContain('2 MB');
    expect(fileProblem({ name: 'quiz.docx', size: MAX_DOCUMENT_BYTES + 1 })).toContain('5 MB');
    expect(fileProblem({ name: 'quiz.pdf', size: MAX_DOCUMENT_BYTES + 1 })).toContain('5 MB');
  });

  it('tells the teacher to save an old .doc as .docx, and names the kinds it takes for anything else', () => {
    expect(fileProblem({ name: 'quiz.doc', size: 10 })).toContain('save it as a .docx');
    expect(fileProblem({ name: 'quiz.odt', size: 10 })).toBe('Choose a CSV, Excel (.xlsx), Word (.docx) or PDF file.');
  });
});

describe('readImportFile', () => {
  it('refuses a file it cannot take before loading any reader', async () => {
    await expect(readImportFile(new File(['x'], 'quiz.doc'), 'single')).rejects.toThrow('save it as a .docx');
    await expect(readImportFile(new File(['x'], 'quiz.txt'), 'single')).rejects.toThrow('Choose a CSV');
  });

  it('reads a Word file with the Word reader', async () => {
    const result = await readImportFile(new File([buildExampleDocx() as BlobPart], 'example.docx'), 'both');
    expect(result.questions).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('reads a CSV with the spreadsheet reader', async () => {
    const columns = Object.keys(examTemplateRows()[0]).map((header) => ({ header, accessor: (row: Record<string, string | number>) => row[header] ?? '' }));
    const result = await readImportFile(new File([rowsToCSV(examTemplateRows(), columns)], 'questions.csv'), 'both');
    expect(result.questions).toHaveLength(3);
    // The first load of the spreadsheet library (with Firebase's Firestore, which it imports) can be slow on a busy machine.
  }, 90_000);

  it('gives a teacher’s message, not a stack, for a Word file that is not one', async () => {
    await expect(readImportFile(new File([new Uint8Array([1, 2, 3])], 'broken.docx'), 'single')).rejects.toThrow(/old \.doc file, password-protected or damaged/);
  });
});
