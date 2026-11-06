import { docxFromBody, escapeXml } from "./docxWriter";
import { rubricToTable, type RubricGrid } from "./rubricTable";

// A rubric's grid as a Word (.docx) file: its title, its description and one bordered table on a landscape page. Loaded only
// when this format is chosen (rubricDownload.ts). The Word template (rubricTemplate.ts) comes through here too.

const run = (text: string, bold = false) =>
  `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

const paragraph = (text: string, bold = false) =>
  `<w:p>${run(text, bold)}</w:p>`;

const BORDER_SIDES = ["top", "left", "bottom", "right", "insideH", "insideV"];
const BORDERS = BORDER_SIDES.map(
  (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`,
).join("");

/** A bordered table whose first row is bold. */
function wordTable(rows: readonly (readonly string[])[]): string {
  const columns = rows[0]?.length ?? 0;
  const grid = Array.from({ length: columns }, () => "<w:gridCol/>").join("");
  const body = rows
    .map(
      (row, r) =>
        `<w:tr>${row.map((cell) => `<w:tc><w:tcPr/>${paragraph(cell, r === 0)}</w:tc>`).join("")}</w:tr>`,
    )
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${BORDERS}</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

const LANDSCAPE =
  '<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/></w:sectPr>';

export function rubricToDocx(rubric: RubricGrid): Uint8Array {
  const parts = [
    paragraph(rubric.title, true),
    ...(rubric.description ? [paragraph(rubric.description)] : []),
    wordTable(rubricToTable(rubric)),
    // Word requires a paragraph after a table.
    "<w:p/>",
    LANDSCAPE,
  ];
  return docxFromBody(parts.join(""));
}
