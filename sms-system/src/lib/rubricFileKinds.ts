import { MAX_SOURCE_FILE_BYTES } from "./documentUpload";
import type { RubricDocument } from "@/types/assessment";

// Which files a rubric may be uploaded as, the limit on them, and how a rubric's two forms are described
// (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.2). Deliberately light: the page checks a chosen file here before
// it reads it. The MIME types mirror isValidRubricFile() in firestore.rules. A rubric has its own list, separate from
// documentUpload.ts, because that one also serves student submissions, which must not start accepting these types.

export type RubricFileKind = "sheet" | "csv" | "word" | "pdf" | "markdown";

export const MAX_RUBRIC_FILE_BYTES = MAX_SOURCE_FILE_BYTES;
export const RUBRIC_FILE_ACCEPT = ".xlsx,.csv,.docx,.pdf,.md,.markdown";
/** What a teacher confirms before any rubric file is saved. The app can't check this itself. */
export const RUBRIC_FILE_CONFIRMATION =
  "This file holds no student names, marks or answer keys. Students and parents can download it exactly as it is.";
/** A limit in the UI only, counted from the list already in memory: the rules cannot count documents. */
export const SOFT_SCHOOL_FILE_LIMIT = 200;

export const RUBRIC_MIME_TYPES: Record<RubricFileKind, string> = {
  sheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  word: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  markdown: "text/markdown",
};

const KIND_BY_EXTENSION: Record<string, RubricFileKind> = {
  xlsx: "sheet",
  csv: "csv",
  docx: "word",
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
};

const REFUSED_EXTENSIONS: Record<string, string> = {
  xls: "An old Excel (.xls) file can't be uploaded. Open it in Excel and save it as a .xlsx file.",
  xlsm: "A macro-enabled Excel (.xlsm) file can't be uploaded. Save it as a .xlsx file, without macros.",
  doc: "An old Word (.doc) file can't be uploaded. Open it in Word and save it as a .docx file.",
  docm: "A macro-enabled Word (.docm) file can't be uploaded. Save it as a .docx file, without macros.",
};

const extensionOf = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** The kind of a file by its name, or null for one that can't be uploaded. */
export const rubricFileKind = (name: string): RubricFileKind | null =>
  name.includes(".") ? (KIND_BY_EXTENSION[extensionOf(name)] ?? null) : null;

/** Why a file can't be uploaded, judged without reading it, or null when it can be tried. */
export function rubricFileProblem(file: {
  name: string;
  size: number;
}): string | null {
  const refused = REFUSED_EXTENSIONS[extensionOf(file.name)];
  if (refused) return refused;
  if (!rubricFileKind(file.name))
    return "Choose an Excel (.xlsx), CSV, Word (.docx), PDF or Markdown (.md) file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_RUBRIC_FILE_BYTES) {
    return "That file is larger than 500 KB. Reduce it, or save a scan as a text PDF, and try again.";
  }
  return null;
}

/** A starting title from a file name: "paragraph-writing_v2.docx" becomes "paragraph writing v2". */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]*$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

type RubricForms = Pick<RubricDocument, "criteria" | "file">;

/** The Type column: which of a rubric's two forms it has. */
export function rubricTypeLabel(rubric: RubricForms): string {
  if (!rubric.file) return "Grid";
  return rubric.criteria.length > 0 ? "Grid + file" : "File only";
}

/** A rubric that holds only a file has no criteria to show. */
export const isFileOnly = (rubric: RubricForms): boolean =>
  !!rubric.file && rubric.criteria.length === 0;

/** Whether the grid was edited after the file went in, so the two may disagree. An unsaved server time counts as no. */
export function gridChangedAfterUpload(
  rubric: Pick<RubricDocument, "file" | "updatedAt">,
): boolean {
  const edited = rubric.updatedAt?.toMillis?.();
  const uploaded = rubric.file?.uploadedAt?.toMillis?.();
  return edited !== undefined && uploaded !== undefined && edited > uploaded;
}
