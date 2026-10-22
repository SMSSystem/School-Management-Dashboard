import type { ExamAnswerMode } from '@/types/exams';
import type { ImportResult } from './examImport';
import { fileProblem, importKind } from './examImportKinds';

// Reads a file chosen in the exam import dialog (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4). This is only the
// router: it loads the reader for the kind of file — the spreadsheet library, the Word reader (a zip reader), pdf.js or the
// Markdown reader — when that kind is chosen, so each is its own chunk and none is in the builder page. The file is read in
// the browser and forgotten; nothing is uploaded or stored. It also makes the template downloads for Word, PDF and Markdown.

/** Checks the file, then reads it with the reader for its kind. Throws an Error with a message for the teacher. */
export async function readImportFile(file: File, answerMode: ExamAnswerMode | undefined): Promise<ImportResult> {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  switch (importKind(file.name)) {
    case 'word':
      return (await import('./examDocx')).readWordFile(file, answerMode);
    case 'pdf':
      return (await import('./examPdf')).readPdfFile(file, answerMode);
    case 'markdown':
      return (await import('./examMarkdown')).readMarkdownFile(file, answerMode);
    default:
      return (await import('./examImportFile')).readExamFile(file, answerMode);
  }
}

/** The template files that are made in the browser (the spreadsheet ones come from examImportFile). */
export type TemplateFileKind = 'docx' | 'pdf' | 'md';

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Downloads a small template (made here, not stored) in the layout the Word, PDF and Markdown readers expect. */
export async function downloadExamTemplateFile(kind: TemplateFileKind): Promise<void> {
  switch (kind) {
    case 'docx': {
      const { buildExampleDocx } = await import('./exampleDocx');
      saveBlob(
        new Blob([buildExampleDocx() as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
        'exam-questions-template.docx',
      );
      return;
    }
    case 'pdf': {
      const { buildExamplePdf } = await import('./examplePdf');
      saveBlob(new Blob([buildExamplePdf() as BlobPart], { type: 'application/pdf' }), 'exam-questions-template.pdf');
      return;
    }
    default: {
      const { buildExampleMarkdown } = await import('./exampleMarkdown');
      saveBlob(new Blob([buildExampleMarkdown()], { type: 'text/markdown;charset=utf-8' }), 'exam-questions-template.md');
    }
  }
}
