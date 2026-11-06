import { strToU8, zipSync } from "fflate";
import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import { docxFromParagraphs } from "../exampleDocx";
import { makePdf } from "../pdfWriter";
import {
  checkRubricBytes,
  csvCells,
  formulaCell,
  processRubricFile,
  RubricFileError,
} from "../rubricFile";
import {
  MAX_RUBRIC_FILE_BYTES,
  RUBRIC_MIME_TYPES,
  gridChangedAfterUpload,
  isFileOnly,
  rubricFileKind,
  rubricFileProblem,
  rubricTypeLabel,
  titleFromFileName,
} from "../rubricFileKinds";
import {
  canControlRubricFile,
  canDeleteRubric,
  canDownloadRubric,
  canOpenRubrics,
  canUploadRubric,
} from "../roleCapabilities";
import rulesRaw from "../../../firestore.rules?raw";

// Which rubric files are accepted (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.2), checked with real generated
// files, how a rubric's forms are described, and who sees which control.

const utf8 = (s: string) => new TextEncoder().encode(s);
const xlsxBytes = (rows: unknown[][], formula?: string) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (formula) sheet.A1 = { t: "n", f: formula, v: 2 };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Rubric");
  return new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
};
const fileOf = (bytes: Uint8Array, name: string) =>
  new File([bytes as BlobPart], name);
const refused = (fn: () => unknown) => expect(fn).toThrow(RubricFileError);

describe("the extension and size, checked before reading", () => {
  it("knows each allowed kind, in any case", () => {
    expect(rubricFileKind("a.xlsx")).toBe("sheet");
    expect(rubricFileKind("A.CSV")).toBe("csv");
    expect(rubricFileKind("a.docx")).toBe("word");
    expect(rubricFileKind("a.b.pdf")).toBe("pdf");
    expect(rubricFileKind("a.md")).toBe("markdown");
    expect(rubricFileKind("a.markdown")).toBe("markdown");
    for (const name of ["a.exe", "a.html", "a.pptx", "a.xls", "md", "xlsx"])
      expect(rubricFileKind(name)).toBeNull();
  });

  it("gives old and macro formats their own message", () => {
    expect(rubricFileProblem({ name: "a.xls", size: 1 })).toContain(".xlsx");
    expect(rubricFileProblem({ name: "a.xlsm", size: 1 })).toContain("macro");
    expect(rubricFileProblem({ name: "a.doc", size: 1 })).toContain(".docx");
    expect(rubricFileProblem({ name: "a.docm", size: 1 })).toContain("macro");
    expect(rubricFileProblem({ name: "a.exe", size: 1 })).toContain("Choose");
  });

  it("allows up to 500 KB, and matches the rules", () => {
    expect(MAX_RUBRIC_FILE_BYTES).toBe(512_000);
    expect(rulesRaw).toContain("d.size <= 512000");
    expect(rubricFileProblem({ name: "a.pdf", size: 512_000 })).toBeNull();
    expect(rubricFileProblem({ name: "a.pdf", size: 512_001 })).toContain(
      "500 KB",
    );
    expect(rubricFileProblem({ name: "a.pdf", size: 0 })).toContain("empty");
  });

  it("lists every MIME type the rules accept", () => {
    for (const mime of Object.values(RUBRIC_MIME_TYPES)) {
      expect(rulesRaw).toContain(mime.split("/")[1].replace(/\./g, "\\\\."));
    }
  });
});

describe("a Word file", () => {
  it("passes when real", () => {
    expect(checkRubricBytes("word", docxFromParagraphs(["Hello"]))).toEqual([]);
  });

  it("is refused when it holds macros, such as a .docm renamed to .docx", () => {
    const bytes = zipSync({
      "word/document.xml": strToU8("<w:document/>"),
      "word/vbaProject.bin": strToU8("macro"),
    });
    expect(() => checkRubricBytes("word", bytes)).toThrow(/macros/);
  });

  it("is refused when it is another zip, such as a renamed .pptx", () => {
    expect(() =>
      checkRubricBytes(
        "word",
        zipSync({ "ppt/presentation.xml": strToU8("<p/>") }),
      ),
    ).toThrow(/real Word/);
  });

  it("is refused when it is not a zip", () => {
    expect(() => checkRubricBytes("word", utf8("not a zip"))).toThrow(
      /real Word/,
    );
    expect(() =>
      checkRubricBytes(
        "word",
        new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
      ),
    ).toThrow(/real Word/);
  });
});

describe("an Excel file", () => {
  it("passes with no warning when it has no formulas", () => {
    expect(
      checkRubricBytes(
        "sheet",
        xlsxBytes([
          ["Criterion", "Max points"],
          ["Content", 4],
        ]),
      ),
    ).toEqual([]);
  });

  it("passes with a warning when it has formulas", () => {
    const warnings = checkRubricBytes("sheet", xlsxBytes([[1], [1]], "A2+1"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("formulas");
  });

  it("is not fooled by a cell whose text looks like a formula", () => {
    expect(checkRubricBytes("sheet", xlsxBytes([["=SUM(A1)", "<f>"]]))).toEqual(
      [],
    );
  });

  it("is refused when it holds macros", () => {
    const bytes = zipSync({
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/vbaProject.bin": strToU8("macro"),
    });
    expect(() => checkRubricBytes("sheet", bytes)).toThrow(/macros/);
  });

  it("is refused, in Excel’s words, when it is another zip or not a zip", () => {
    expect(() =>
      checkRubricBytes("sheet", docxFromParagraphs(["Hello"])),
    ).toThrow(/real Excel/);
    expect(() => checkRubricBytes("sheet", utf8("not a zip"))).toThrow(
      /real Excel/,
    );
  });
});

describe("a PDF", () => {
  it("passes when real, and is refused otherwise", () => {
    expect(checkRubricBytes("pdf", makePdf([["Hello"]]))).toEqual([]);
    expect(() => checkRubricBytes("pdf", utf8("<html></html>"))).toThrow(
      /real PDF/,
    );
  });
});

describe("a Markdown file", () => {
  it("passes as UTF-8 text", () => {
    expect(
      checkRubricBytes("markdown", utf8("# Rubric\n\n| a | b |\n| é | ñ |")),
    ).toEqual([]);
  });

  it("is refused with NUL bytes or invalid UTF-8", () => {
    refused(() =>
      checkRubricBytes("markdown", new Uint8Array([0x61, 0x00, 0x62])),
    );
    refused(() =>
      checkRubricBytes("markdown", new Uint8Array([0xff, 0xfe, 0x61])),
    );
  });
});

describe("a CSV", () => {
  it("splits cells, with quoted commas, quotes and line breaks", () => {
    expect(csvCells('a,"b,c"\r\n"d ""e""","f\ng"\nh')).toEqual([
      { row: 1, value: "a" },
      { row: 1, value: "b,c" },
      { row: 2, value: 'd "e"' },
      { row: 2, value: "f\ng" },
      { row: 3, value: "h" },
    ]);
  });

  it("allows real numbers, such as -5 and +3", () => {
    expect(
      formulaCell("Name,Points\nContent,-5\nStyle,+3\nNeat,-2.5"),
    ).toBeNull();
    expect(checkRubricBytes("csv", utf8("Name,Points\nContent,-5"))).toEqual(
      [],
    );
  });

  it("finds a formula, wherever it starts", () => {
    for (const cell of [
      "=1+1",
      "+SUM(A1)",
      "-cmd",
      "@SUM(A1)",
      " =1+1",
      '"=1+1"',
      "\t=1+1",
    ]) {
      expect(formulaCell(`Name,Points\nContent,${cell}`), cell).not.toBeNull();
    }
    expect(formulaCell('a,b\nc,=HYPERLINK("x")')).toMatchObject({ row: 2 });
  });

  it("allows ordinary text with those characters inside it", () => {
    expect(formulaCell("a=b,c+d,e-f,g@h\n,,,")).toBeNull();
  });

  it("is refused with a formula, naming the row", () => {
    expect(() => checkRubricBytes("csv", utf8("a,b\nc,=1+1"))).toThrow(/Row 2/);
  });

  it("copes with a byte order mark", () => {
    expect(checkRubricBytes("csv", utf8("﻿Name,Points"))).toEqual([]);
  });
});

describe("processing a chosen file", () => {
  it("builds the data URL from the checked type, not the browser’s", async () => {
    const out = await processRubricFile(
      new File([makePdf([["Hi"]]) as BlobPart], "r.pdf", { type: "text/html" }),
    );
    expect(out.mimeType).toBe("application/pdf");
    expect(out.dataUrl.startsWith("data:application/pdf;base64,JVBERi")).toBe(
      true,
    );
    expect(out.fileName).toBe("r.pdf");
    expect(out.warnings).toEqual([]);
  });

  it("keeps Excel’s warning, and a maximum-size file fits the rules’ limit", async () => {
    const warned = await processRubricFile(
      fileOf(xlsxBytes([[1]], "A2+1"), "r.xlsx"),
    );
    expect(warned.warnings).toHaveLength(1);
    const big = await processRubricFile(
      fileOf(utf8("a".repeat(512_000)), "big.md"),
    );
    expect(big.dataUrl.length).toBeLessThanOrEqual(700_000);
  });

  it("refuses an oversized or wrong file without reading further", async () => {
    await expect(
      processRubricFile(fileOf(utf8("a".repeat(512_001)), "big.md")),
    ).rejects.toThrow(/500 KB/);
    await expect(processRubricFile(fileOf(utf8("x"), "a.exe"))).rejects.toThrow(
      RubricFileError,
    );
  });
});

describe("describing a rubric", () => {
  const criterion = { id: "c", name: "n", maxPoints: 1, levels: [] };
  const file = { uploadedAt: { toMillis: () => 1000 } } as never;

  it("names its type", () => {
    expect(rubricTypeLabel({ criteria: [criterion] })).toBe("Grid");
    expect(rubricTypeLabel({ criteria: [criterion], file })).toBe(
      "Grid + file",
    );
    expect(rubricTypeLabel({ criteria: [], file })).toBe("File only");
    expect(isFileOnly({ criteria: [], file })).toBe(true);
    expect(isFileOnly({ criteria: [criterion], file })).toBe(false);
    expect(isFileOnly({ criteria: [] })).toBe(false);
  });

  it("knows when the grid changed after the upload", () => {
    const at = (ms: number) => ({ toMillis: () => ms }) as never;
    expect(gridChangedAfterUpload({ file, updatedAt: at(2000) })).toBe(true);
    expect(gridChangedAfterUpload({ file, updatedAt: at(1000) })).toBe(false);
    expect(gridChangedAfterUpload({ file })).toBe(false);
    expect(gridChangedAfterUpload({ updatedAt: at(2000) })).toBe(false);
  });

  it("makes a starting title from a file name", () => {
    expect(titleFromFileName("paragraph-writing_v2.docx")).toBe(
      "paragraph writing v2",
    );
    expect(titleFromFileName("Oral.Skills.pdf")).toBe("Oral.Skills");
    expect(titleFromFileName(`${"a".repeat(200)}.pdf`)).toHaveLength(150);
  });
});

describe("who sees which control", () => {
  const uploader = { uploadedBy: "me" };
  const other = { uploadedBy: "them" };

  it("hides the page from super_admin, a student and a parent only", () => {
    for (const r of [
      "institution_admin",
      "senior_teacher",
      "regular_teacher",
      "spectator",
    ] as const)
      expect(canOpenRubrics(r), r).toBe(true);
    for (const r of ["super_admin", "student", "parent", null] as const)
      expect(canOpenRubrics(r), String(r)).toBe(false);
  });

  it("lets admins and teachers upload", () => {
    for (const r of [
      "institution_admin",
      "senior_teacher",
      "regular_teacher",
    ] as const)
      expect(canUploadRubric(r), r).toBe(true);
    for (const r of [
      "super_admin",
      "student",
      "parent",
      "spectator",
      null,
    ] as const)
      expect(canUploadRubric(r), String(r)).toBe(false);
  });

  it("lets everyone download but a spectator, and super_admin for now", () => {
    for (const r of [
      "institution_admin",
      "senior_teacher",
      "regular_teacher",
      "student",
      "parent",
    ] as const)
      expect(canDownloadRubric(r), r).toBe(true);
    for (const r of ["spectator", "super_admin", null] as const)
      expect(canDownloadRubric(r), String(r)).toBe(false);
  });

  it("lets an admin or the uploader control a file", () => {
    expect(canControlRubricFile("institution_admin", "me", other)).toBe(true);
    expect(canControlRubricFile("regular_teacher", "me", uploader)).toBe(true);
    expect(canControlRubricFile("senior_teacher", "me", uploader)).toBe(true);
    expect(canControlRubricFile("regular_teacher", "me", other)).toBe(false);
    expect(canControlRubricFile("senior_teacher", "me", other)).toBe(false);
    expect(canControlRubricFile("regular_teacher", "me", undefined)).toBe(
      false,
    );
    for (const r of ["student", "parent", "spectator"] as const)
      expect(canControlRubricFile(r, "me", uploader), r).toBe(false);
  });

  it("lets an admin delete anything, and a teacher only their own upload", () => {
    expect(
      canDeleteRubric("institution_admin", "me", { createdBy: "them" }),
    ).toBe(true);
    expect(
      canDeleteRubric("regular_teacher", "me", {
        createdBy: "me",
        file: uploader,
      }),
    ).toBe(true);
    expect(
      canDeleteRubric("regular_teacher", "me", { createdBy: "me" }),
      "a typed rubric",
    ).toBe(false);
    expect(
      canDeleteRubric("regular_teacher", "me", {
        createdBy: "them",
        file: uploader,
      }),
    ).toBe(false);
    expect(
      canDeleteRubric("regular_teacher", "me", {
        createdBy: "me",
        file: other,
      }),
    ).toBe(false);
    expect(
      canDeleteRubric("spectator", "me", { createdBy: "me", file: uploader }),
    ).toBe(false);
    const read = { fileName: "r.md" };
    expect(
      canDeleteRubric("senior_teacher", "me", {
        createdBy: "me",
        readFrom: read,
      }),
      "a rubric they read from a file",
    ).toBe(true);
    expect(
      canDeleteRubric("regular_teacher", "me", {
        createdBy: "them",
        readFrom: read,
      }),
    ).toBe(false);
    expect(
      canDeleteRubric("spectator", "me", { createdBy: "me", readFrom: read }),
    ).toBe(false);
  });
});
