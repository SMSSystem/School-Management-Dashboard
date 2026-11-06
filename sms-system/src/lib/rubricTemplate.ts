import { downloadRubric, type RubricDownloadFormat } from "./rubricDownload";
import { csvEscape, downloadCSVRaw } from "./spreadsheetExport";
import { rubricFileBase, rubricToTable, type RubricGrid } from "./rubricTable";

// The template teachers fill in (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 8). One grid feeds every format, through
// the same builders as a rubric's downloads, and a test reads each one back through its reader, so the templates and the parser
// can't drift apart. Built in the browser, with no Firebase reads. Loaded only when a format is chosen, because it brings the
// spreadsheet library.

const levels = (
  excellent: string,
  good: string,
  developing: string,
  beginning: string,
) => [
  { label: "Excellent", points: 4, description: excellent },
  { label: "Good", points: 3, description: good },
  { label: "Developing", points: 2, description: developing },
  { label: "Beginning", points: 1, description: beginning },
];

export const RUBRIC_TEMPLATE: RubricGrid = {
  title: "Rubric template",
  criteria: [
    {
      id: "template-content",
      name: "Content and ideas",
      maxPoints: 4,
      levels: levels(
        "Clear, accurate and complete",
        "Mostly clear, with small gaps",
        "Partly clear; needs prompting",
        "Not yet clear; needs support",
      ),
    },
    {
      id: "template-organisation",
      name: "Organisation",
      maxPoints: 4,
      levels: levels(
        "Logical from start to end",
        "Mostly logical",
        "Some order, some jumps",
        "Hard to follow",
      ),
    },
    {
      id: "template-language",
      name: "Language",
      maxPoints: 4,
      levels: levels(
        "Precise, with almost no errors",
        "Clear, with a few errors",
        "Errors sometimes get in the way",
        "Errors often get in the way",
      ),
    },
  ],
};

/** The template as CSV, with the header first and no title row. */
export const rubricTemplateCsv = (): string =>
  rubricToTable(RUBRIC_TEMPLATE)
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

export type RubricTemplateFormat = "csv" | Exclude<RubricDownloadFormat, "pdf">;

export async function downloadRubricTemplate(
  format: RubricTemplateFormat,
): Promise<void> {
  if (format === "csv") {
    downloadCSVRaw(
      `${rubricFileBase(RUBRIC_TEMPLATE.title)}.csv`,
      rubricTemplateCsv(),
    );
    return;
  }
  await downloadRubric(RUBRIC_TEMPLATE, format);
}
