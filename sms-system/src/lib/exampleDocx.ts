import { docxFromBody, escapeXml } from "./docxWriter";
import { EXAMPLE_PARAGRAPHS } from "./exampleText";

// A small, valid Word (.docx) file made in the browser for the import dialog's "Download an example Word file"
// (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): three questions in the layout the reader expects — a single-answer
// question, a multiple-answer one with points, and a true-or-false one — that a teacher can open, edit and import again.
// Nothing is stored; the same function builds the file for the download and for the tests.

export { EXAMPLE_PARAGRAPHS };

/** A minimal .docx holding the given paragraphs of plain text (and nothing else Word needs to open it). */
export function docxFromParagraphs(paragraphs: readonly string[]): Uint8Array {
  return docxFromBody(
    paragraphs
      .map((p) =>
        p === ""
          ? "<w:p/>"
          : `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`,
      )
      .join(""),
  );
}

/** The example exam as a .docx file. */
export function buildExampleDocx(): Uint8Array {
  return docxFromParagraphs(EXAMPLE_PARAGRAPHS);
}
