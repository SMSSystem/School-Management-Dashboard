import { EXAMPLE_PARAGRAPHS } from './exampleText';
import { makePdf } from './pdfWriter';

// A small, valid PDF made in the browser for the import dialog's template download (docs/miscellaneous-specs/
// EXAMS_FEATURE_SPEC.md §4.4): the same three example questions as the Word and Markdown templates, as selectable text in
// the layout the PDF reader expects. Nothing is stored; the same function builds the file for the download and the tests.

/** The example as a PDF (one page). */
export function buildExamplePdf(): Uint8Array {
  return makePdf([EXAMPLE_PARAGRAPHS]);
}
