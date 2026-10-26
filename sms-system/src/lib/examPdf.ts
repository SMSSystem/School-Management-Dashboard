import type { ExamAnswerMode } from '@/types/exams';
import { questionsFromLines } from './examDocumentText';
import type { ImportResult } from './examImport';
import { PictureCollector, type BitmapReader } from './examPdfImages';
import type { ImportPicture } from './examImportPictures';
import { linesOfPages, looksScanned, type PagePicture, type TextPiece } from './pdfLines';

// Reading questions from a PDF with a real text layer (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4), with Mozilla's
// pdf.js. This module is loaded only when a PDF is chosen in the import dialog, and pdf.js (about 1 MB) and its worker
// (about 1.3 MB) are separate files served from the app's own origin: nothing is fetched from a CDN. The legacy build is
// used because it runs on older school machines and the same code runs in the unit tests under Node. Only text is read,
// so system fonts and the image-decoding WebAssembly are off and nothing but the two files above is fetched, which keeps
// it inside the page's Content-Security-Policy. A scan has no text layer and is refused; there is no OCR. The pictures
// the pages paint are read too (examPdfImages.ts): each is put among the text lines by its position, as a marker line, so
// the question parser places it and the import dialog's picture step reviews it.

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
export async function pagesOfPdf(
  lib: PdfLib,
  bytes: Uint8Array,
  options: { pictures?: boolean; readBitmap?: BitmapReader } = {},
): Promise<{ pages: TextPiece[][]; pageCount: number; pictures?: { list: ImportPicture[]; perPage: PagePicture[][]; notes: string[] } }> {
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
    const collector = options.pictures ? new PictureCollector(lib, options.readBitmap) : null;
    for (let n = 1; n <= count; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(
        content.items.flatMap((item) =>
          'str' in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height }] : [],
        ),
      );
      // A picture that cannot be read never fails the import: the questions are what matter.
      if (collector) await collector.addPage(n - 1, page).catch(() => undefined);
      page.cleanup();
    }
    const found = collector?.finish(count);
    return {
      pages,
      pageCount: doc.numPages,
      ...(found && { pictures: { list: found.pictures, perPage: found.perPage, notes: found.notes } }),
    };
  } catch (err) {
    // A page that cannot be read (a damaged page, a font pdf.js cannot use) is said in words a teacher can act on.
    if (err instanceof PdfError) throw err;
    throw new PdfError('A page of that PDF could not be read. It may be damaged; try saving or exporting it again.');
  } finally {
    await task.destroy();
  }
}

/** The questions in a PDF's bytes. `lib` is pdf.js. */
export async function questionsFromPdf(
  lib: PdfLib,
  bytes: Uint8Array,
  answerMode: ExamAnswerMode | undefined,
  readBitmap?: BitmapReader,
): Promise<ImportResult> {
  const { pages, pageCount, pictures } = await pagesOfPdf(lib, bytes, { pictures: true, readBitmap });
  // The scan check looks at the text alone: a page of pictures and no words is a scan.
  if (looksScanned(linesOfPages(pages), pageCount)) {
    throw new PdfError(
      'That PDF has no text to read. It looks like a scan or a photo, and there is no text recognition. Use a PDF exported from Word or another program, or the spreadsheet template.',
    );
  }
  const result = questionsFromLines(linesOfPages(pages, pictures?.perPage), answerMode);
  const notes = [
    ...(pageCount > MAX_PDF_PAGES ? [`Only the first ${MAX_PDF_PAGES} of ${pageCount} pages were read.`] : []),
    ...(pictures?.notes ?? []),
  ];
  return {
    ...result,
    warnings: [...notes.map((message) => ({ message })), ...result.warnings],
    // Only when the file had pictures; a result without them is exactly what it was before pictures were read.
    ...(pictures && pictures.list.length > 0 && { pictures: pictures.list }),
  };
}

/** The pixels of an ImageBitmap through a canvas (a browser may hand pdf.js's pictures over as bitmaps). */
const readBitmapPixels: BitmapReader = async (bitmap) => {
  const source = bitmap as ImageBitmap;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(source.width, source.height) : Object.assign(document.createElement('canvas'), { width: source.width, height: source.height });
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;
  context.drawImage(source, 0, 0);
  const { width, height, data } = context.getImageData(0, 0, source.width, source.height);
  return { width, height, data };
};

/** Loads pdf.js and its worker (from this app, not a CDN) the first time it is needed; the snapshot tool uses it too. */
export async function loadPdfLib(): Promise<PdfLib> {
  const [lib, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return lib;
}

/**
 * Reads a chosen PDF file. The result keeps the file's bytes (`source`), so the snapshot tool can draw its pages for a figure
 * that is drawn with shapes and so was not found as a picture.
 */
export async function readPdfFile(file: File, answerMode: ExamAnswerMode | undefined): Promise<ImportResult> {
  const lib = await loadPdfLib();
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new PdfError('That file could not be opened. Choose it again.');
  }
  const result = await questionsFromPdf(lib, bytes, answerMode, readBitmapPixels);
  return { ...result, source: { kind: 'pdf', bytes } };
}
