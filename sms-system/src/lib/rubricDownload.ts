import { createElement } from "react";
import { saveBlob } from "./downloadFile";
import {
  rubricFileBase,
  rubricToMarkdown,
  rubricToTable,
  type RubricGrid,
} from "./rubricTable";

// Builds a downloadable copy of a rubric's grid in the browser (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 9), so
// these downloads cost no Firebase reads. The spreadsheet library, the Word writer and the PDF engine are each loaded only when
// that format is chosen, so none of them is in the Rubrics page's own chunk.

export type RubricDownloadFormat = "pdf" | "xlsx" | "docx" | "md";

export const RUBRIC_DOWNLOAD_FORMATS: {
  format: RubricDownloadFormat;
  label: string;
}[] = [
  { format: "pdf", label: "PDF" },
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "docx", label: "Word (.docx)" },
  { format: "md", label: "Markdown (.md)" },
];

async function downloadExcel(rubric: RubricGrid, name: string): Promise<void> {
  const { downloadXLSX, rowsToXLSXSheet } = await import("./spreadsheetExport");
  const [header, ...rows] = rubricToTable(rubric);
  const columns = header.map((text, i) => ({
    header: text,
    accessor: (row: string[]) => row[i],
  }));
  downloadXLSX(`${name}.xlsx`, [
    { name: "Rubric", sheet: rowsToXLSXSheet(rows, columns) },
  ]);
}

async function downloadWord(rubric: RubricGrid, name: string): Promise<void> {
  const { rubricToDocx } = await import("./rubricWordFile");
  saveBlob(
    new Blob([rubricToDocx(rubric) as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    `${name}.docx`,
  );
}

async function downloadPdf(rubric: RubricGrid, name: string): Promise<void> {
  const [{ pdf }, { default: RubricPDF }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/rubric/RubricPDF"),
  ]);
  const document = createElement(RubricPDF, {
    rubric,
  }) as unknown as Parameters<typeof pdf>[0];
  saveBlob(await pdf(document).toBlob(), `${name}.pdf`);
}

/** Saves the grid in the chosen format. */
export async function downloadRubric(
  rubric: RubricGrid,
  format: RubricDownloadFormat,
): Promise<void> {
  const name = rubricFileBase(rubric.title);
  switch (format) {
    case "xlsx":
      return downloadExcel(rubric, name);
    case "docx":
      return downloadWord(rubric, name);
    case "pdf":
      return downloadPdf(rubric, name);
    default:
      saveBlob(
        new Blob([rubricToMarkdown(rubric)], {
          type: "text/markdown;charset=utf-8",
        }),
        `${name}.md`,
      );
  }
}
