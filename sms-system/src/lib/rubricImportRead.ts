import type { ProcessedRubricFile } from "./rubricFile";
import { rubricFileKind } from "./rubricFileKinds";
import type { FoundRubric } from "./rubricFromTable";

// A chosen rubric file: its checks, then an attempt to read rubrics from it (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md
// section 7.1). This is only the router, so it stays in the page's chunk: the checks and each reader load when a file of that
// kind is chosen. A file may hold several rubrics (D18). When any is read, the file itself is not stored (D16); a file with
// none is stored whole, so a file that can't be read just has no rubrics, whatever went wrong. PDFs are not read yet.
// Everything happens in the browser, and nothing here costs a Firebase read.

export type { FoundRubric };

async function readByKind(
  fileName: string,
  bytes: Uint8Array,
): Promise<FoundRubric[]> {
  switch (rubricFileKind(fileName)) {
    case "csv":
      return (await import("./rubricSheetRead")).readCsvRubrics(bytes);
    case "sheet":
      return (await import("./rubricSheetRead")).readExcelRubrics(bytes);
    case "word":
      return (await import("./rubricDocx")).readWordRubrics(bytes);
    case "markdown":
      return (await import("./rubricMarkdown")).readMarkdownRubrics(bytes);
    default:
      return [];
  }
}

/** The rubrics in a file that passed its checks, in order. Empty when none could be read. Never throws. */
export async function readRubrics(file: File): Promise<FoundRubric[]> {
  try {
    return await readByKind(
      file.name,
      new Uint8Array(await file.arrayBuffer()),
    );
  } catch {
    return [];
  }
}

export type ChosenRubricFile =
  | { file: ProcessedRubricFile; rubrics: FoundRubric[]; error?: undefined }
  | { file?: undefined; rubrics?: undefined; error: string };

/**
 * Checks a chosen file and, if it may be stored, reads its rubrics. A refused file comes back with a message. When rubrics are
 * found, `file` is used only for its name: it is never stored (D16).
 */
export async function chooseRubricFile(
  chosen: File,
): Promise<ChosenRubricFile> {
  const { readRubricFile } = await import("./rubricFile");
  const result = await readRubricFile(chosen);
  if (!result.file) return { error: result.error };
  return { file: result.file, rubrics: await readRubrics(chosen) };
}
