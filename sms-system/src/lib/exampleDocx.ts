import { strToU8, zipSync } from "fflate";
import { EXAMPLE_PARAGRAPHS } from "./exampleText";

// A small, valid Word (.docx) file made in the browser for the import dialog's "Download an example Word file"
// (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.4): three questions in the layout the reader expects — a single-answer
// question, a multiple-answer one with points, and a true-or-false one — that a teacher can open, edit and import again.
// Nothing is stored; the same function builds the file for the download and for the tests. Only `fflate` is used.

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export { EXAMPLE_PARAGRAPHS };

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** A minimal .docx holding the given paragraphs of plain text (and nothing else Word needs to open it). */
export function docxFromParagraphs(paragraphs: readonly string[]): Uint8Array {
  const body = paragraphs
    .map((p) =>
      p === ""
        ? "<w:p/>"
        : `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`,
    )
    .join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
    ),
  });
}

/** The example exam as a .docx file. */
export function buildExampleDocx(): Uint8Array {
  return docxFromParagraphs(EXAMPLE_PARAGRAPHS);
}
