import { strToU8, zipSync } from "fflate";
import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import { checkRubricBytes } from "../rubricFile";
import { docxTables, readWordGrid } from "../rubricDocx";
import {
  parseLevelLabel,
  rubricFromTable,
  rubricFromTables,
} from "../rubricFromTable";
import { chooseRubricFile, readRubricGrid } from "../rubricImportRead";
import { readMarkdownGrid } from "../rubricMarkdown";
import { csvRows, readCsvGrid, readExcelGrid } from "../rubricSheetRead";
import { rubricToMarkdown, rubricToTable } from "../rubricTable";
import { RUBRIC_TEMPLATE, rubricTemplateCsv } from "../rubricTemplate";
import { rubricToDocx } from "../rubricWordFile";
import { rowsToXLSXSheet } from "../spreadsheetExport";
import routerRaw from "../rubricImportRead.ts?raw";
import sheetRaw from "../rubricSheetRead.ts?raw";
import templateMenuRaw from "../../components/rubric/RubricTemplateMenu.tsx?raw";
import type { RubricCriterion } from "@/types/assessment";

// Reading a rubric's grid out of a file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md sections 7.3, 7.4 and 8.4), using real
// generated files. A file that doesn't hold the expected layout must come back with no grid, never a wrong one.

const withoutIds = (criteria: RubricCriterion[]) =>
  criteria.map(({ name, maxPoints, levels }) => ({ name, maxPoints, levels }));

const HEADER = ["Criterion", "Max points", "Excellent (4)", "Good (3)"];

function xlsxOf(rows: string[][], extra?: (book: XLSX.WorkBook) => void) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Rubric");
  extra?.(book);
  return new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}

/** The app's Excel download, built the way rubricDownload.ts builds it. */
function excelFromGrid(grid: Parameters<typeof rubricToTable>[0]) {
  const [header, ...rows] = rubricToTable(grid);
  const sheet = rowsToXLSXSheet(
    rows,
    header.map((text, i) => ({
      header: text,
      accessor: (row: string[]) => row[i],
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Rubric");
  return new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}

const fileOf = (bytes: Uint8Array | string, name: string) =>
  new File([bytes as BlobPart], name);

describe("what each screen loads", () => {
  const norm = (s: string) => s.replace(/\s+/g, " ");

  it("leaves the readers and their libraries out of the page", () => {
    const router = norm(routerRaw);
    for (const reader of ["rubricSheetRead", "rubricDocx", "rubricMarkdown"])
      expect(router).toContain(`await import("./${reader}")`);
    expect(routerRaw).not.toMatch(
      /^import (?!type)[^\n]*(rubricSheetRead|rubricDocx|rubricMarkdown|rubricFile")/m,
    );
    expect(sheetRaw).not.toMatch(/^import [^\n]*xlsx/m);
    expect(norm(sheetRaw)).toContain('await import("@e965/xlsx")');
  });

  it("loads the template builders only when a format is chosen", () => {
    expect(norm(templateMenuRaw)).toContain(
      'await import("@/lib/rubricTemplate")',
    );
    expect(templateMenuRaw).not.toMatch(
      /^import (?!type)[^\n]*rubricTemplate/m,
    );
  });
});

describe("a level's name and points", () => {
  it.each([
    ["Excellent (4)", "Excellent", 4, false],
    ["Excellent [4]", "Excellent", 4, false],
    ["Excellent (4 pts)", "Excellent", 4, false],
    ["4 - Excellent", "Excellent", 4, false],
    ["4: Excellent", "Excellent", 4, false],
    ["Excellent 4 pts", "Excellent", 4, false],
    ["Excellent 4", "Excellent", 4, false],
    ["Good (3-4)", "Good", 4, true],
    ["3-4 - Good", "Good", 4, true],
    ["Good (3 to 4)", "Good", 4, true],
    ["Half (2.5)", "Half", 2.5, false],
    ["4", "4", 4, false],
    ["3-4", "3-4", 4, true],
    ["3.5", "3.5", 3.5, false],
    ["(4)", "(4)", 4, false],
  ])("%s", (text, label, points, range) => {
    expect(parseLevelLabel(text)).toEqual({ label, points, range });
  });

  it("gives no points when the text names none", () => {
    expect(parseLevelLabel("Meets expectations")).toEqual({
      label: "Meets expectations",
      points: null,
      range: false,
    });
  });
});

describe("rubricFromTable", () => {
  it("reads the template's layout", () => {
    const { criteria, warnings } = rubricFromTable([
      HEADER,
      ["Content", "4", "Clear", "Mostly clear"],
      ["Order", "4", "Logical", "Mostly logical"],
    ]);
    expect(withoutIds(criteria)).toEqual([
      {
        name: "Content",
        maxPoints: 4,
        levels: [
          { label: "Excellent", points: 4, description: "Clear" },
          { label: "Good", points: 3, description: "Mostly clear" },
        ],
      },
      {
        name: "Order",
        maxPoints: 4,
        levels: [
          { label: "Excellent", points: 4, description: "Logical" },
          { label: "Good", points: 3, description: "Mostly logical" },
        ],
      },
    ]);
    expect(warnings).toEqual([]);
    expect(new Set(criteria.map((c) => c.id)).size).toBe(2);
  });

  it("skips a title above the header, and blank rows", () => {
    const { criteria } = rubricFromTable([
      ["Essay rubric"],
      [],
      HEADER,
      ["", "", "", ""],
      ["Content", "4", "Clear", "Fine"],
    ]);
    expect(criteria.map((c) => c.name)).toEqual(["Content"]);
  });

  it("finds a table that starts a column in", () => {
    const { criteria } = rubricFromTable([
      ["", ...HEADER],
      ["", "Content", "4", "Clear", "Fine"],
    ]);
    expect(criteria[0].name).toBe("Content");
    expect(criteria[0].levels).toHaveLength(2);
  });

  it("takes max points from the highest level when there is no such column", () => {
    const { criteria } = rubricFromTable([
      ["Category", "Good (3)", "Excellent (5)"],
      ["Content", "a", "b"],
    ]);
    expect(criteria[0].maxPoints).toBe(5);
  });

  it("takes the highest level when the stated max points isn't a number", () => {
    const { criteria } = rubricFromTable([
      HEADER,
      ["Content", "lots", "a", "b"],
    ]);
    expect(criteria[0].maxPoints).toBe(4);
  });

  it("warns about what doesn't fit the data model", () => {
    const warningsFor = (rows: string[][]) => rubricFromTable(rows).warnings;
    expect(
      warningsFor([
        ["Criterion", "Good (3-4)", "Fair (1-2)"],
        ["Content", "a", "b"],
      ]),
    ).toEqual([expect.stringMatching(/range of points/)]);
    const noPoints = rubricFromTable([
      ["Criterion", "Meets", "Below"],
      ["Content", "a", "b"],
    ]);
    expect(noPoints.warnings).toEqual([expect.stringMatching(/no points/)]);
    expect(noPoints.criteria[0].maxPoints).toBe(0);
    expect(noPoints.criteria[0].levels[0].points).toBe(0);
    expect(warningsFor([HEADER, ["Content × 3", "4", "a", "b"]])).toEqual([
      expect.stringMatching(/weighted/),
    ]);
    expect(warningsFor([HEADER, ["Content", "2", "a", "b"]])).toEqual([
      expect.stringMatching(/more than/),
    ]);
  });

  it("drops a Total row and an unnamed row, and warns", () => {
    const { criteria, warnings } = rubricFromTable([
      HEADER,
      ["Content", "4", "a", "b"],
      ["", "", "stray", ""],
      ["Total", "4", "", ""],
    ]);
    expect(criteria.map((c) => c.name)).toEqual(["Content"]);
    expect(warnings).toEqual([
      expect.stringMatching(/Total row/),
      expect.stringMatching(/no criterion name/),
    ]);
  });

  it("keeps to the limits on criteria, levels and text", () => {
    const manyLevels = Array.from({ length: 12 }, (_, i) => `L${i} (${i})`);
    const { criteria, warnings } = rubricFromTable([
      ["Criterion", ...manyLevels],
      ...Array.from({ length: 55 }, (_, i) => [
        `C${i}`,
        "x".repeat(2000),
        ...manyLevels.slice(1),
      ]),
    ]);
    expect(criteria).toHaveLength(50);
    expect(criteria[0].levels).toHaveLength(10);
    expect(criteria[0].levels[0].description).toHaveLength(1000);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/shortened/),
        expect.stringMatching(/first 50 criteria/),
        expect.stringMatching(/first 10 levels/),
      ]),
    );
  });

  it("finds no grid in tables that aren't the expected layout", () => {
    for (const rows of [
      [],
      [["Just a heading"]],
      [
        ["Name", "Mark"],
        ["A student", "7"],
      ],
      [
        ["Criteria", "Marks"],
        ["Content", "10"],
      ],
      [
        ["Criteria", "Allotted marks", "Marks awarded", "Comments"],
        ["Content", "10", "7", "ok"],
      ],
      [
        ["Criterion", "Good (3)"],
        ["Content", "a"],
      ],
      [HEADER],
    ]) {
      expect(rubricFromTable(rows).criteria).toEqual([]);
    }
  });

  it("reads the Level columns of the app's download when criteria differ", () => {
    const grid = {
      criteria: [
        {
          id: "a",
          name: "A",
          maxPoints: 4,
          levels: [
            { label: "Top", points: 4, description: "Best" },
            { label: "Low", points: 1, description: "" },
          ],
        },
        {
          id: "b",
          name: "B",
          maxPoints: 2,
          levels: [
            { label: "Fine", points: 2, description: "ok (really): yes" },
          ],
        },
      ],
    };
    const { criteria } = rubricFromTable(rubricToTable(grid));
    expect(withoutIds(criteria)).toEqual(withoutIds(grid.criteria));
  });

  it("from several tables keeps the largest, and says so", () => {
    const small = [HEADER, ["One", "4", "a", "b"]];
    const large = [HEADER, ["Two", "4", "a", "b"], ["Three", "4", "a", "b"]];
    const { criteria, warnings } = rubricFromTables([small, [["no"]], large]);
    expect(criteria.map((c) => c.name)).toEqual(["Two", "Three"]);
    expect(warnings[0]).toMatch(/2 rubric tables/);
    expect(rubricFromTables([small, [["no"]]]).warnings).toEqual([]);
    expect(rubricFromTables([[["no"]]]).criteria).toEqual([]);
  });
});

describe("the CSV reader", () => {
  it("handles quoted commas, quotes and line breaks", () => {
    expect(csvRows('a,"b, c"\n"d ""e""","f\ng"\r\n')).toEqual([
      ["a", "b, c"],
      ['d "e"', "f\ng"],
      [""],
    ]);
  });

  it("reads a grid", () => {
    const text = `${HEADER.join(",")}\nContent,4,"Clear, full",Fine\n`;
    const { criteria } = readCsvGrid(strToU8(text));
    expect(criteria[0].levels[0].description).toBe("Clear, full");
  });
});

describe("the Excel reader", () => {
  it("reads a grid under a title row", async () => {
    const { criteria, warnings } = await readExcelGrid(
      xlsxOf([["Essay"], HEADER, ["Content", "4", "Clear", "Fine"]]),
    );
    expect(criteria.map((c) => c.name)).toEqual(["Content"]);
    expect(warnings).toEqual([]);
  });

  it("fills merged cells from their first cell", async () => {
    const bytes = xlsxOf(
      [HEADER, ["Content", "4", "Same for both", ""]],
      (book) => {
        book.Sheets.Rubric["!merges"] = [
          { s: { r: 1, c: 2 }, e: { r: 1, c: 3 } },
        ];
      },
    );
    const { criteria } = await readExcelGrid(bytes);
    expect(criteria[0].levels.map((l) => l.description)).toEqual([
      "Same for both",
      "Same for both",
    ]);
  });

  it("reads only the first visible sheet, and says so", async () => {
    const other = [HEADER, ["Not read", "4", "a", "b"]];
    const bytes = xlsxOf([["hidden sheet comes first"]], (book) => {
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([HEADER, ["Read", "4", "a", "b"]]),
        "Visible",
      );
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet(other),
        "Later",
      );
      book.Workbook = { Sheets: [{ Hidden: 1 }, { Hidden: 0 }, { Hidden: 0 }] };
    });
    const { criteria, warnings } = await readExcelGrid(bytes);
    expect(criteria.map((c) => c.name)).toEqual(["Read"]);
    expect(warnings[0]).toMatch(/first sheet, “Visible”/);
  });

  it("shows a formula's stored result as text, and doesn't run it", async () => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([HEADER, ["Content", "4", "a", "b"]]);
    sheet.C2 = { t: "s", v: "shown", f: 'HYPERLINK("http://x","shown")' };
    XLSX.utils.book_append_sheet(book, sheet, "Rubric");
    const bytes = new Uint8Array(
      XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
    const { criteria } = await readExcelGrid(bytes);
    expect(criteria[0].levels[0].description).toBe("shown");
  });

  it("stops at a workbook that inflates too far, before the spreadsheet library sees it", async () => {
    const huge = zipSync({
      "xl/a.xml": new Uint8Array(12 * 1024 * 1024),
      "xl/b.xml": new Uint8Array(12 * 1024 * 1024),
    });
    expect(huge.length).toBeLessThan(512_000);
    await expect(readExcelGrid(huge)).rejects.toThrow(/too large/);
    expect(await readRubricGrid(fileOf(huge, "r.xlsx"))).toBeNull();
  });
});

describe("the Word reader", () => {
  const cell = (text: string, props = "") =>
    `<w:tc><w:tcPr>${props}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const row = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
  const table = (...rows: string[]) => `<w:tbl>${rows.join("")}</w:tbl>`;

  it("decodes text and joins a cell's paragraphs", () => {
    const xml = table(
      row(
        `<w:tc><w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p><w:p><w:r><w:t>C</w:t></w:r></w:p></w:tc>`,
      ),
    );
    expect(docxTables(xml)[0][0][0].trim()).toBe("A & B C");
  });

  it("repeats a cell spanning columns or rows", () => {
    const xml = table(
      row(cell("Top", '<w:gridSpan w:val="2"/>'), cell("End")),
      row(cell("Left", '<w:vMerge w:val="restart"/>'), cell("x"), cell("y")),
      row(cell("", "<w:vMerge/>"), cell("p"), cell("q")),
    );
    expect(docxTables(xml)[0].map((r) => r.map((c) => c.trim()))).toEqual([
      ["Top", "Top", "End"],
      ["Left", "x", "y"],
      ["Left", "p", "q"],
    ]);
  });

  it("ignores a table within a table, deleted text and text outside tables", () => {
    const xml = `<w:p><w:r><w:t>Outside</w:t></w:r></w:p>${table(
      row(
        `<w:tc><w:p><w:r><w:t>Kept</w:t></w:r><w:del><w:r><w:t>Gone</w:t></w:r></w:del></w:p>${table(row(cell("Nested")))}</w:tc>`,
        cell("Next"),
      ),
    )}`;
    const tables = docxTables(xml);
    expect(tables).toHaveLength(1);
    expect(tables[0][0].map((c) => c.trim())).toEqual(["Kept", "Next"]);
  });

  it("refuses nothing it can't read: no body, no grid", () => {
    expect(
      readWordGrid(zipSync({ "a.xml": strToU8("<a/>") })).criteria,
    ).toEqual([]);
  });

  it("finds no grid in a document with no tables", () => {
    const bytes = zipSync({
      "word/document.xml": strToU8(
        "<w:document><w:body><w:p/></w:body></w:document>",
      ),
    });
    expect(readWordGrid(bytes).criteria).toEqual([]);
  });
});

describe("the Markdown reader", () => {
  it("reads a pipe table, with escaped pipes and bold headings", () => {
    const text = [
      "# My rubric",
      "",
      "| **Criterion** | Max points | Excellent (4) | Good (3) |",
      "| :--- | --- | ---: | --- |",
      "| Content | 4 | Clear \\| full | Fine |",
    ].join("\n");
    const { criteria } = readMarkdownGrid(strToU8(text));
    expect(criteria[0].levels[0].description).toBe("Clear | full");
  });

  it("reads a heading for each criterion with a list of its levels", () => {
    const text = [
      "# My rubric",
      "",
      "## Content (4)",
      "- Excellent (4): Clear",
      "- Good (3): Fine",
      "",
      "## Order",
      "* Excellent (5)",
      "* Good (3)",
    ].join("\n");
    const { criteria } = readMarkdownGrid(strToU8(text));
    expect(withoutIds(criteria)).toEqual([
      {
        name: "Content",
        maxPoints: 4,
        levels: [
          { label: "Excellent", points: 4, description: "Clear" },
          { label: "Good", points: 3, description: "Fine" },
        ],
      },
      {
        name: "Order",
        maxPoints: 5,
        levels: [
          { label: "Excellent", points: 5, description: "" },
          { label: "Good", points: 3, description: "" },
        ],
      },
    ]);
  });

  it("finds no grid in ordinary notes, or in a table inside a code block", () => {
    const notes =
      "## Notes\n- Bring a pen\n- Be on time\n\nSome text | with a pipe\n";
    expect(readMarkdownGrid(strToU8(notes)).criteria).toEqual([]);
    const fenced = `\`\`\`\n${HEADER.join("|")}\n---|---|---|---\nC|4|a|b\n\`\`\`\n`;
    expect(readMarkdownGrid(strToU8(fenced)).criteria).toEqual([]);
  });
});

describe("the router", () => {
  it("returns no grid for a PDF, a file with none, and anything that fails", async () => {
    expect(await readRubricGrid(fileOf("%PDF-1.4", "r.pdf"))).toBeNull();
    expect(await readRubricGrid(fileOf("no table", "r.md"))).toBeNull();
    expect(await readRubricGrid(fileOf("not a zip", "r.docx"))).toBeNull();
    expect(await readRubricGrid(fileOf("not a zip", "r.xlsx"))).toBeNull();
  });

  it("keeps a file with no grid, and passes on a refusal", async () => {
    const kept = await chooseRubricFile(fileOf("no table", "r.md"));
    expect(kept.file?.fileName).toBe("r.md");
    expect(kept.grid).toBeNull();
    const refused = await chooseRubricFile(fileOf("a,=1+1", "r.csv"));
    expect(refused.file).toBeUndefined();
    expect(refused.error).toMatch(/formula/);
  });

  it("returns a file and its grid together", async () => {
    const chosen = await chooseRubricFile(
      fileOf(`${HEADER.join(",")}\nContent,4,a,b\n`, "r.csv"),
    );
    expect(chosen.file?.mimeType).toBe("text/csv");
    expect(chosen.grid?.criteria[0].name).toBe("Content");
  });
});

describe("each template reads back into the same grid", () => {
  const expected = withoutIds(RUBRIC_TEMPLATE.criteria);
  const cases: [
    string,
    "csv" | "sheet" | "word" | "markdown",
    () => Uint8Array,
  ][] = [
    ["CSV", "csv", () => strToU8(rubricTemplateCsv())],
    ["Excel", "sheet", () => excelFromGrid(RUBRIC_TEMPLATE)],
    ["Word", "word", () => rubricToDocx(RUBRIC_TEMPLATE)],
    ["Markdown", "markdown", () => strToU8(rubricToMarkdown(RUBRIC_TEMPLATE))],
  ];
  const names = {
    csv: "t.csv",
    sheet: "t.xlsx",
    word: "t.docx",
    markdown: "t.md",
  };

  it.each(cases)("%s", async (_label, kind, build) => {
    const bytes = build();
    expect(checkRubricBytes(kind, bytes), "passes the upload's checks").toEqual(
      [],
    );
    const read = await readRubricGrid(fileOf(bytes, names[kind]));
    expect(withoutIds(read!.criteria)).toEqual(expected);
    expect(read!.warnings).toEqual([]);
  });

  it("starts a CSV with the header, with no title row", () => {
    expect(csvRows(rubricTemplateCsv())[0]).toEqual([
      "Criterion",
      "Max points",
      "Excellent (4)",
      "Good (3)",
      "Developing (2)",
      "Beginning (1)",
    ]);
  });
});
