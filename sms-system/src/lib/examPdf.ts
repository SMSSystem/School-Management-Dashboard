import type { ExamAnswerMode } from '@/types/exams';
import { questionsFromLines } from './examDocumentText';
import type { ImportResult } from './examImport';
import { linesOfPages, looksScanned, type TextPiece } from './pdfLines';

// Reading questions from a PDF with a real text layer (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4), with Mozilla's
// pdf.js. This module is loaded only when a PDF is chosen in the import dialog, and pdf.js (about 1 MB) and its worker
// (about 1.3 MB) are separate files served from the app's own origin: nothing is fetched from a CDN. The legacy build is
// used because it runs on older school machines and the same code runs in the unit tests under Node. Only text is read,
// so system fonts and the image-decoding WebAssembly are off and nothing but the two files above is fetched, which keeps
// it inside the page's Content-Security-Policy. A scan has no text layer and is refused; there is no OCR.

/** Pages read from one PDF; an exam of 100 questions fits in far fewer. */
export const MAX_PDF_PAGES = 60;

export class PdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfError';
  }
}

type PdfLib = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/**
 * The pieces of text of each page of a PDF, using an already-loaded pdf.js. Throws a PdfError, in words a teacher can act
 * on, for a file that is password-protected or cannot be read.
 */
export async function pagesOfPdf(lib: PdfLib, bytes: Uint8Array): Promise<{ pages: TextPiece[][]; pageCount: number }> {
  const task = lib.getDocument({ data: bytes, useSystemFonts: false, useWasm: false, verbosity: 0 });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await task.destroy().catch(() => undefined);
    if ((err as { name?: string }).name === 'PasswordException') {
      throw new PdfError('That PDF is password-protected. Remove the password, or save it again as a normal PDF, and try again.');
    }
    throw new PdfError('That file could not be read as a PDF. It may be damaged; try saving or exporting it again.');
  }
  try {
    const pages: TextPiece[][] = [];
    const count = Math.min(doc.numPages, MAX_PDF_PAGES);
    for (let n = 1; n <= count; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items.flatMap((item) =>
          'str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }] : [],
        ),
      );
      page.cleanup();
    }
    return { pages, pageCount: doc.numPages };
  } catch (err) {
    // A page that cannot be read (a damaged page, a font pdf.js cannot use) is said in words a teacher can act on.
    if (err instanceof PdfError) throw err;
    throw new PdfError('A page of that PDF could not be read. It may be damaged; try saving or exporting it again.');
  } finally {
    await task.destroy();
  }
}

/** The questions in a PDF's bytes. `lib` is pdf.js. */
export async function questionsFromPdf(lib: PdfLib, bytes: Uint8Array, answerMode: ExamAnswerMode | undefined): Promise<ImportResult> {
  const { pages, pageCount } = await pagesOfPdf(lib, bytes);
  const lines = linesOfPages(pages);
  if (looksScanned(lines, pageCount)) {
    throw new PdfError(
      'That PDF has no text to read. It looks like a scan or a photo, and there is no text recognition. Use a PDF exported from Word or another program, or the spreadsheet template.',
    );
  }
  const result = questionsFromLines(lines, answerMode);
  return pageCount > MAX_PDF_PAGES
    ? { ...result, warnings: [{ message: `Only the first ${MAX_PDF_PAGES} of ${pageCount} pages were read.` }, ...result.warnings] }
    : result;
}

/** Reads a chosen PDF file: loads pdf.js and its worker (from this app, not a CDN) the first time it is needed. */
export async function readPdfFile(file: File, answerMode: ExamAnswerMode | undefined): Promise<ImportResult> {
  const [lib, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new PdfError('That file could not be opened. Choose it again.');
  }
  return questionsFromPdf(lib, bytes, answerMode);
}
