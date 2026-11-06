import { strToU8 } from "fflate";
import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import { validateCriteria } from "../rubricCriteria";
import { docxSourcedTables } from "../rubricDocx";
import { readMarkdownRubrics } from "../rubricMarkdown";
import { readCsvRubrics, readExcelRubrics } from "../rubricSheetRead";
import { rubricToTable } from "../rubricTable";
import { fileTitle, initialTitle, resolveTitle } from "../rubricTitles";
import { rubricToDocx } from "../rubricWordFile";
import storeRaw from "../rubricFileStore.ts?raw";
import uploadRaw from "../../components/rubric/RubricUploadDialog.tsx?raw";
import actionsRaw from "../../components/rubric/RubricFileActions.tsx?raw";
import carouselRaw from "../../components/rubric/RubricCarousel.tsx?raw";
import pdfRaw from "../../components/rubric/RubricPDF.tsx?raw";
import type { RubricCriterion } from "@/types/assessment";

// A file read into a grid is never stored (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D16), a file may hold several rubrics,
// each with a title choice (D18, D23), and a criterion may have no levels (D20). Real generated files where it matters.

const norm = (s: string) => s.replace(/\s+/g, " ");
const HEADER = ["Criterion", "Max points", "Excellent (4)", "Good (3)"];
const table = (name: string) =>
  `${HEADER.join(" | ")}\n--- | --- | --- | ---\n${name} | 4 | a | b`;

describe("titles", () => {
  it("number the file's name only when a file holds several rubrics", () => {
    expect(fileTitle("project-rubric.docx", 0, 1)).toBe("project rubric");
    expect(fileTitle("project-rubric.docx", 1, 3)).toBe("project rubric 2");
    expect(fileTitle(".md", 0, 1)).toBe("Rubric");
  });

  it("start on the heading when there is one", () => {
    expect(initialTitle("Essay")).toEqual({ choice: "heading", typed: "" });
    expect(initialTitle("  ")).toEqual({ choice: "file", typed: "" });
  });

  it("give the chosen title, tidied, and nothing for an empty typed one", () => {
    expect(
      resolveTitle({ choice: "heading", typed: "" }, " Essay  rubric ", "f"),
    ).toBe("Essay rubric");
    expect(resolveTitle({ choice: "file", typed: "" }, "Essay", "f 2")).toBe(
      "f 2",
    );
    expect(
      resolveTitle({ choice: "typed", typed: "  Mine " }, "Essay", "f"),
    ).toBe("Mine");
    expect(resolveTitle({ choice: "typed", typed: " " }, "Essay", "f")).toBe(
      "",
    );
    expect(resolveTitle({ choice: "heading", typed: "" }, "", "f")).toBe("f");
    expect(
      resolveTitle({ choice: "typed", typed: "x".repeat(200) }, "", "f"),
    ).toHaveLength(150);
  });
});

describe("several rubrics in one file, each with its heading", () => {
  it("Markdown: one per table, headed by the heading above it", () => {
    const text = [
      "# Course",
      "",
      "## Oral",
      "",
      table("Voice"),
      "",
      "Notes.",
      "",
      table("Order"),
      "",
    ].join("\n");
    const found = readMarkdownRubrics(strToU8(text));
    expect(found.map((f) => [f.criteria[0].name, f.heading, f.source])).toEqual(
      [
        ["Voice", "Oral", "Table 1"],
        ["Order", "", "Table 2"],
      ],
    );
  });

  it("Word: one per top-level table, headed by the paragraph above it", () => {
    const p = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
    const row = (...cells: string[]) =>
      `<w:tr>${cells.map((c) => `<w:tc>${p(c)}</w:tc>`).join("")}</w:tr>`;
    const tbl = (name: string) =>
      `<w:tbl>${row(...HEADER)}${row(name, "4", "a", "b")}</w:tbl>`;
    const xml = `${p("First rubric")}${tbl("A")}${p("")}${tbl("B")}`;
    expect(docxSourcedTables(xml).map((t) => t.heading)).toEqual([
      "First rubric",
      "",
    ]);
  });

  it("CSV: a title row above the header is the heading", () => {
    const [found] = readCsvRubrics(
      strToU8(`Essay rubric\n${HEADER.join(",")}\nContent,4,a,b\n`),
    );
    expect(found.heading).toBe("Essay rubric");
  });

  it("Excel: a sheet of names and marks gives nothing, and the rubric sheet is named", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Name", "Mark"],
        ["A student", 7],
      ]),
      "Marks",
    );
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([HEADER, ["Content", "4", "a", "b"]]),
      "Rubric",
    );
    const bytes = new Uint8Array(
      XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    const found = await readExcelRubrics(bytes);
    expect(found.map((f) => [f.heading, f.source])).toEqual([
      ["Rubric", "Sheet “Rubric”"],
    ]);
  });
});

describe("a mark sheet beside a rubric", () => {
  it("is never read, even with a Criteria heading, because none of its columns has points", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Criteria", "Student A", "Student B", "Student C"],
        ["Content", 4, 3, 5],
        ["Order", 2, 4, 3],
      ]),
      "Marks",
    );
    const bytes = new Uint8Array(
      XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    expect(await readExcelRubrics(bytes)).toEqual([]);
  });
});

describe("a criterion with no levels", () => {
  const bare: RubricCriterion = {
    id: "a",
    name: "Presentation",
    maxPoints: 10,
    levels: [],
  };

  it("may be saved when it has max points, but not without them", () => {
    expect(validateCriteria([bare], false)).toBeNull();
    expect(validateCriteria([{ ...bare, maxPoints: 0 }], false)).toMatch(
      /max points/,
    );
  });

  it("downloads as its name and maximum", () => {
    expect(rubricToTable({ criteria: [bare] })).toEqual([
      ["Criterion", "Max points"],
      ["Presentation", "10"],
    ]);
    expect(
      rubricToTable({
        criteria: [
          bare,
          {
            ...bare,
            id: "b",
            name: "Content",
            levels: [{ label: "Good", points: 3 }],
          },
        ],
      }),
    ).toEqual([
      ["Criterion", "Max points", "Level 1"],
      ["Presentation", "10", ""],
      ["Content", "10", "Good (3)"],
    ]);
    expect(
      rubricToDocx({ title: "T", criteria: [bare] }).length,
    ).toBeGreaterThan(0);
  });

  it("says so in the carousel and the PDF", () => {
    expect(norm(carouselRaw)).toContain(
      "No levels. Marked out of {criterion.maxPoints}.",
    );
    expect(norm(pdfRaw)).toContain("No levels.");
  });
});

describe("a file read into a grid is never stored", () => {
  const store = norm(storeRaw);
  const between = (text: string, from: string, to: string) =>
    text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));

  it("saves a new rubric from a grid with no file and no body", () => {
    const create = between(
      store,
      "export async function createRubricFromGrid",
      "export async function replaceGridFromFile",
    );
    expect(create).not.toContain("file:");
    expect(create).not.toContain("fileRef(");
    expect(create).toContain("the file was not kept");
    expect(create).toContain(
      "readFrom: { fileName: p.fileName.slice(0, 255) }",
    );
  });

  it("replaces a grid and removes a stored file in one batch", () => {
    const replace = between(
      store,
      "export async function replaceGridFromFile",
      "export async function replaceRubricFile",
    );
    expect(replace).toContain("...(p.removeFile && { file: deleteField() })");
    expect(replace).toContain(
      "if (p.removeFile) batch.delete(fileRef(rubric));",
    );
    expect(replace).not.toContain("bodyOf(");
  });

  it("stores a file only when no rubric was found in it", () => {
    const upload = norm(uploadRaw);
    expect(upload).toContain("createRubricFromGrid(");
    expect(upload).toContain("if (chosen.rubrics.length === 0)");
    expect(upload).toContain(
      "const gridFound = !!chosen && chosen.rubrics.length > 0;",
    );
    expect(upload).not.toMatch(/createRubricFromFile\(\{[^}]*criteria/);
    const actions = norm(actionsRaw);
    expect(actions).toContain("removeFile: hasFile,");
    expect(actions).toContain("pending && pending.found.length === 0 && (");
  });
});
