import type { ProcessedRubricFile } from "./rubricFile";
import { rubricFileKind } from "./rubricFileKinds";
import type { RubricGridRead } from "./rubricFromTable";

// A chosen rubric file: its checks, then an attempt to read a grid from it (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md
// section 7.1). This is only the router, so it stays in the page's chunk: the checks and each reader load when a file of that
// kind is chosen. The original file is always kept (D1), so a file that can't be read just has no grid, whatever went wrong.
// PDFs are stored but not read (D14). Everything happens in the browser, and nothing here costs a Firebase read.

export type { RubricGridRead };

async function readByKind(
  fileName: string,
  bytes: Uint8Array,
): Promise<RubricGridRead | null> {
  switch (rubricFileKind(fileName)) {
    case "csv":
      return (await import("./rubricSheetRead")).readCsvGrid(bytes);
    case "sheet":
      return (await import("./rubricSheetRead")).readExcelGrid(bytes);
    case "word":
      return (await import("./rubricDocx")).readWordGrid(bytes);
    case "markdown":
      return (await import("./rubricMarkdown")).readMarkdownGrid(bytes);
    default:
      return null;
  }
}

/** The grid in a file that passed its checks, or null when none could be read. Never throws. */
export async function readRubricGrid(
  file: File,
): Promise<RubricGridRead | null> {
  try {
    const read = await readByKind(
      file.name,
      new Uint8Array(await file.arrayBuffer()),
    );
    return read && read.criteria.length > 0 ? read : null;
  } catch {
    return null;
  }
}

export type ChosenRubricFile =
  | {
      file: ProcessedRubricFile;
      grid: RubricGridRead | null;
      error?: undefined;
    }
  | { file?: undefined; grid?: undefined; error: string };

/** Checks a chosen file and, if it may be stored, tries to read a grid from it. A refused file comes back with a message. */
export async function chooseRubricFile(
  chosen: File,
): Promise<ChosenRubricFile> {
  const { readRubricFile } = await import("./rubricFile");
  const result = await readRubricFile(chosen);
  if (!result.file) return { error: result.error };
  return { file: result.file, grid: await readRubricGrid(chosen) };
}
