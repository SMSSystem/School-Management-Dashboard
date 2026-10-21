import type { ExamAnswerMode } from '@/types/exams';
import type { ImportResult } from './examImport';
import { fileProblem, importKind } from './examImportKinds';

// Reads a file chosen in the exam import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4). This is only the
// router: it loads the reader for the kind of file — the spreadsheet library, the Word reader (a zip reader) or pdf.js —
// when that kind is chosen, so each is its own chunk and none is in the builder page. The file is read in the browser and
// forgotten; nothing is uploaded or stored.

/** Checks the file, then reads it with the reader for its kind. Throws an Error with a message for the teacher. */
export async function readImportFile(file: File, answerMode: ExamAnswerMode | undefined): Promise<ImportResult> {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  switch (importKind(file.name)) {
    case 'word':
      return (await import('./examDocx')).readWordFile(file, answerMode);
    case 'pdf':
      return (await import('./examPdf')).readPdfFile(file, answerMode);
    default:
      return (await import('./examImportFile')).readExamFile(file, answerMode);
  }
}

/** Downloads a small example Word file (made here, not stored) in the layout the Word and PDF readers expect. */
export async function downloadExampleDocx(): Promise<void> {
  const { buildExampleDocx } = await import('./exampleDocx');
  const blob = new Blob([buildExampleDocx() as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exam-questions-example.docx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
