import { strFromU8 } from "fflate";
import { bytesToBase64 } from "./documentUpload";
import { DocxError, extractEntry, indexZip, type ZipEntry } from "./docxZip";
import {
  RUBRIC_MIME_TYPES,
  rubricFileKind,
  rubricFileProblem,
  type RubricFileKind,
} from "./rubricFileKinds";

// Checks a chosen rubric file and turns it into what Firestore stores (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md
// section 7.2). The MIME type comes from these checks, never from the browser. A file reaches students' and parents' devices
// unchanged and there is no malware scanning on the free plan, so this refuses macros and CSV formulas, and warns about Excel
// formulas, which many real spreadsheets have. This does not widen documentUpload.ts, because that serves student
// submissions too. Pure, apart from reading the File.

export class RubricFileError extends Error {}

export type ProcessedRubricFile = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
  warnings: string[];
};

/** The most XML one worksheet may inflate to while looking for formulas. */
const MAX_SHEET_XML_BYTES = 20 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, i) => bytes[i] === byte);
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

const WRONG_CONTENT: Record<"sheet" | "word", string> = {
  sheet:
    "That file isn't a real Excel (.xlsx) file. Open it in Excel and save it again.",
  word: "That file isn't a real Word (.docx) file. Open it in Word and save it again.",
};
const MACROS =
  "That file contains macros, so it can't be uploaded. Save it again without macros.";

/** The zip's entries, with its reader's Word-specific errors replaced by wording for this kind of file. */
function zipEntries(
  bytes: Uint8Array,
  kind: "sheet" | "word",
): Map<string, ZipEntry> {
  try {
    if (!startsWith(bytes, ZIP_SIGNATURE)) throw new DocxError("not a zip");
    return indexZip(bytes);
  } catch (error) {
    if (error instanceof DocxError)
      throw new RubricFileError(WRONG_CONTENT[kind]);
    throw error;
  }
}

const hasMacros = (entries: Map<string, ZipEntry>) =>
  [...entries.keys()].some((name) =>
    name.toLowerCase().endsWith("vbaproject.bin"),
  );

function worksheetHasFormula(bytes: Uint8Array, entry: ZipEntry): boolean {
  try {
    return /<(?:\w+:)?f[\s/>]/.test(
      strFromU8(extractEntry(bytes, entry, MAX_SHEET_XML_BYTES)),
    );
  } catch (error) {
    if (error instanceof DocxError)
      throw new RubricFileError(WRONG_CONTENT.sheet);
    throw error;
  }
}

function checkExcel(bytes: Uint8Array): string[] {
  const entries = zipEntries(bytes, "sheet");
  if (hasMacros(entries)) throw new RubricFileError(MACROS);
  if (!entries.has("xl/workbook.xml"))
    throw new RubricFileError(WRONG_CONTENT.sheet);
  const sheets = [...entries.entries()].filter(([name]) =>
    /^xl\/worksheets\/[^/]+\.xml$/i.test(name),
  );
  return sheets.some(([, entry]) => worksheetHasFormula(bytes, entry))
    ? [
        "This file has formulas, and they stay in the copy people download. If it doesn't need them, paste the cells as values first.",
      ]
    : [];
}

function checkWord(bytes: Uint8Array): void {
  const entries = zipEntries(bytes, "word");
  if (hasMacros(entries)) throw new RubricFileError(MACROS);
  if (!entries.has("word/document.xml"))
    throw new RubricFileError(WRONG_CONTENT.word);
}

function textOf(bytes: Uint8Array): string {
  if (bytes.includes(0))
    throw new RubricFileError("That file isn't a plain text file.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RubricFileError(
      "That file isn't saved as UTF-8 text. Save it as UTF-8 and try again.",
    );
  }
}

/** The cells of a CSV as written, each with the row it is on (from 1). Handles quoted commas, quotes and line breaks. */
export function csvCells(text: string): { row: number; value: string }[] {
  const cells: { row: number; value: string }[] = [];
  let row = 1;
  let value = "";
  let quoted = false;
  const end = () => {
    cells.push({ row, value });
    value = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"' && value === "") quoted = true;
    else if (c === ",") end();
    else if (c === "\n") {
      end();
      row += 1;
    } else if (c !== "\r" || text[i + 1] !== "\n") value += c;
  }
  end();
  return cells;
}

// The same start as csvEscape() in spreadsheetExport.ts: a spreadsheet app reads these as a formula.
const FORMULA_START = /^[=+\-@\t\r]/;

/** The first cell a spreadsheet app would read as a formula, or null. A real number, such as -5, is not one. */
export function formulaCell(
  text: string,
): { row: number; value: string } | null {
  for (const cell of csvCells(text)) {
    const trimmed = cell.value.trim();
    if (
      trimmed !== "" &&
      Number.isNaN(Number(trimmed)) &&
      (FORMULA_START.test(cell.value) || FORMULA_START.test(trimmed))
    ) {
      return cell;
    }
  }
  return null;
}

const BYTE_ORDER_MARK = new RegExp(`^${String.fromCharCode(0xfeff)}`);

function checkCsv(bytes: Uint8Array): void {
  const cell = formulaCell(textOf(bytes).replace(BYTE_ORDER_MARK, ""));
  if (cell) {
    throw new RubricFileError(
      `Row ${cell.row} has a cell that a spreadsheet would run as a formula ("${cell.value.trim().slice(0, 30)}"). Change it so it doesn't start with = + - or @, and try again.`,
    );
  }
}

/** Refuses bad contents by throwing RubricFileError, and returns what the uploader should be warned about. */
export function checkRubricBytes(
  kind: RubricFileKind,
  bytes: Uint8Array,
): string[] {
  switch (kind) {
    case "sheet":
      return checkExcel(bytes);
    case "word":
      checkWord(bytes);
      return [];
    case "pdf":
      if (!startsWith(bytes, PDF_SIGNATURE))
        throw new RubricFileError("That file isn't a real PDF.");
      return [];
    case "csv":
      checkCsv(bytes);
      return [];
    default:
      textOf(bytes);
      return [];
  }
}

/** Checks a chosen file and builds what is stored. Throws RubricFileError with a message for the teacher. */
export async function processRubricFile(
  file: File,
): Promise<ProcessedRubricFile> {
  const problem = rubricFileProblem(file);
  if (problem) throw new RubricFileError(problem);
  const kind = rubricFileKind(file.name) as RubricFileKind;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const warnings = checkRubricBytes(kind, bytes);
  const mimeType = RUBRIC_MIME_TYPES[kind];
  return {
    dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
    fileName: file.name.slice(0, 255),
    mimeType,
    size: file.size,
    warnings,
  };
}

/** The same, without throwing for a refused file, for the screens: they load this module only when a file is chosen. */
export async function readRubricFile(
  file: File,
): Promise<
  | { file: ProcessedRubricFile; error?: undefined }
  | { file?: undefined; error: string }
> {
  try {
    return { file: await processRubricFile(file) };
  } catch (err) {
    return {
      error:
        err instanceof RubricFileError
          ? err.message
          : "That file could not be read. Please try another file.",
    };
  }
}
