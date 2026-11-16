import { linesOfPages, looksScanned } from "./pdfLines";
import { rubricsFromTables, type FoundRubric } from "./rubricFromTable";
import { pdfTables } from "./rubricPdfTables";

// Reads rubrics from a PDF with a text layer (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D21), with the exam import's
// pdf.js (examPdf.ts). That module is loaded only here, on demand, as the exam import loads it, so pdf.js stays in one place
// and is fetched only when a PDF is chosen. A scan has no text, so it gives no rubrics and is kept whole as a file, as before.
// Only text is read, never pictures.

type ExamPdf = typeof import("./examPdf");
type PdfLib = Parameters<ExamPdf["pagesOfPdf"]>[0];

/** The rubrics in a PDF's bytes, given a loaded pdf.js. Exported for the tests, which run pdf.js under Node. */
export async function rubricsFromPdf(
  lib: PdfLib,
  bytes: Uint8Array,
): Promise<FoundRubric[]> {
  const { pagesOfPdf } = await import("./examPdf");
  const { pages, pageCount } = await pagesOfPdf(lib, bytes);
  if (looksScanned(linesOfPages(pages), pageCount)) return [];
  return rubricsFromTables(pdfTables(pages));
}

export async function readPdfRubrics(
  bytes: Uint8Array,
): Promise<FoundRubric[]> {
  const { loadPdfLib } = await import("./examPdf");
  return rubricsFromPdf(await loadPdfLib(), bytes);
}
