import { strToU8, zipSync } from "fflate";
import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import { readWordRubrics } from "../rubricDocx";
import { readMarkdownRubrics } from "../rubricMarkdown";
import { readCsvRubrics, readExcelRubrics } from "../rubricSheetRead";
import {
  readAllottedMarks,
  readMarkRanges,
  readSharedScale,
} from "../rubricLayouts";
import { titleAbove } from "../rubricLevels";

// The other layouts real rubric files use (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D17 and D19), with generated files
// that copy each layout's shape using invented text. Students' work beside a rubric must never be read into it.

const shape = (
  criteria: {
    name: string;
    maxPoints: number;
    levels: { label: string; points: number; description?: string }[];
  }[],
) =>
  criteria.map(({ name, maxPoints, levels }) => ({
    name,
    maxPoints,
    levels: levels.map(({ label, points, description }) => ({
      label,
      points,
      description: description ?? "",
    })),
  }));

const xlsx = (
  sheets: { name: string; rows: (string | number)[][]; merges?: string[] }[],
) => {
  const book = XLSX.utils.book_new();
  for (const { name, rows, merges } of sheets) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    if (merges)
      sheet["!merges"] = merges.map((m) => XLSX.utils.decode_range(m));
    XLSX.utils.book_append_sheet(book, sheet, name);
  }
  return new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
};

describe("a shared scale beside the criteria", () => {
  const SCALE_SHEET = [
    ["Criteria", "Rating scale", "Marks Awarded"],
    ["", "", ""],
    ["Voice", "3. Strong", 2],
    ["Pace", "2. Steady", 3],
    ["Eye contact", "1. Weak", 1],
    ["Structure", "", 2],
    ["Total", "(12 marks)", 8],
  ];

  it("gives every criterion the same levels, with merged header rows and a Total skipped", async () => {
    const [found] = await readExcelRubrics(
      xlsx([
        {
          name: "Rubric",
          rows: SCALE_SHEET,
          merges: ["A1:A2", "B1:B2", "C1:C2"],
        },
      ]),
    );
    const levels = [
      { label: "Strong", points: 3 },
      { label: "Steady", points: 2 },
      { label: "Weak", points: 1 },
    ];
    expect(shape(found.criteria)).toEqual(
      ["Voice", "Pace", "Eye contact", "Structure"].map((name) => ({
        name,
        maxPoints: 3,
        levels: levels.map((l) => ({ ...l, description: "" })),
      })),
    );
    expect(found.warnings[0]).toMatch(/one scale/);
  });

  it("never reads a student's marks: only the column right beside the criteria", () => {
    const rows = [
      ["Criteria", "Marks Awarded", "Scale"],
      ["Voice", "3", "3. Strong"],
      ["Pace", "2", "2. Steady"],
    ];
    expect(readSharedScale(rows)).toBeNull();
  });

  it("needs at least two scale entries with different points", () => {
    expect(
      readSharedScale([
        ["Criteria", "Scale"],
        ["Voice", "3. Strong"],
        ["Pace", ""],
      ]),
    ).toBeNull();
    expect(
      readSharedScale([
        ["Criteria", "Scale"],
        ["Voice", "3. Strong"],
        ["Pace", "3. Also"],
      ]),
    ).toBeNull();
  });
});

describe("mark ranges beside levels", () => {
  const p = (text: string, list = false) =>
    `<w:p>${list ? '<w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const cell = (...paras: string[]) => `<w:tc>${paras.join("")}</w:tc>`;
  const row = (...cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
  const docx = (body: string) =>
    zipSync({
      "word/document.xml": strToU8(
        `<w:document><w:body>${body}</w:body></w:document>`,
      ),
    });
  const FILE = docx(
    `<w:tbl>${[
      row(cell(p("Project title")), cell(), cell()),
      row(cell(p("Name: A Student")), cell(), cell()),
      row(cell(p("Date: 01/02/2026")), cell(), cell()),
      row(cell(p("Area")), cell(p("Allotted marks")), cell()),
      row(
        cell(
          p("Planning"),
          p("Clear plan, every step", true),
          p("and timings", false),
          p("Some steps", true),
          p("No plan", true),
        ),
        cell(p("8-10 marks", true), p("3-7 marks", true), p("1-3 mark", true)),
        cell(p("7")),
      ),
      row(
        cell(p("Report"), p("Complete", true), p("Partial", true)),
        cell(p("5 marks"), p("1 mark")),
        cell(p("4")),
      ),
      row(
        cell(p("Extra"), p("Only one level", true), p("Another", true)),
        cell(p("4 marks"), p("2 marks"), p("1 mark")),
        cell(p("2")),
      ),
      row(cell(), cell(p("Total")), cell(p("13"))),
    ].join("")}</w:tbl>`,
  );

  it("reads list items, joining wrapped ones, with each range as a level", () => {
    const [found] = readWordRubrics(FILE);
    expect(shape(found.criteria)).toEqual([
      {
        name: "Planning",
        maxPoints: 10,
        levels: [
          {
            label: "8-10 marks",
            points: 10,
            description: "Clear plan, every step and timings",
          },
          { label: "3-7 marks", points: 7, description: "Some steps" },
          { label: "1-3 mark", points: 3, description: "No plan" },
        ],
      },
      {
        name: "Report",
        maxPoints: 5,
        levels: [
          { label: "5 marks", points: 5, description: "Complete" },
          { label: "1 mark", points: 1, description: "Partial" },
        ],
      },
    ]);
  });

  it("warns about uneven ranges, and never suggests a form field as the title", () => {
    const [found] = readWordRubrics(FILE);
    expect(found.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/overlap or leave gaps/),
        expect.stringMatching(/didn't match up/),
      ]),
    );
    expect(found.heading).toBe("Project title");
  });

  it("reads lines in a CSV cell, and <br> in Markdown, the same way", () => {
    const csv = `Area,Allotted marks\nPlanning\nClear\nVague,"5 marks\n2 marks"\n`;
    const [fromCsv] = readCsvRubrics(
      strToU8(
        csv.replace("Planning\nClear\nVague", '"Planning\nClear\nVague"'),
      ),
    );
    expect(
      fromCsv.criteria[0].levels.map((l) => [l.label, l.description]),
    ).toEqual([
      ["5 marks", "Clear"],
      ["2 marks", "Vague"],
    ]);
    const md =
      "| Area | Points |\n| --- | --- |\n| Planning<br>Clear<br>Vague | 4 points<br/>1 point |\n";
    const [fromMd] = readMarkdownRubrics(strToU8(md));
    expect(fromMd.criteria[0].levels.map((l) => l.points)).toEqual([4, 1]);
  });

  it("never reads a column about a student's marks", () => {
    expect(
      readMarkRanges([
        ["Area", "Marks awarded"],
        ["Planning\nClear\nVague", "5 marks\n2 marks"],
      ]),
    ).toBeNull();
  });
});

describe("allotted marks with no levels", () => {
  it("reads a maximum per criterion under an explicit heading beside the criteria", () => {
    const read = readAllottedMarks([
      ["Criteria", "Marks allotted", "Marks awarded"],
      ["Research", "10", "7"],
      ["Poster", "(5)", "4"],
      ["Total", "20", "11"],
    ]);
    expect(shape(read!.criteria)).toEqual([
      { name: "Research", maxPoints: 10, levels: [] },
      { name: "Poster", maxPoints: 5, levels: [] },
    ]);
    expect(read!.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /Total row says 20, but the criteria add up to 15/,
        ),
      ]),
    );
  });

  it("doesn't read a plain Marks column, which may be one student's marks", () => {
    expect(
      readAllottedMarks([
        ["Criteria", "Marks"],
        ["Research", "7"],
      ]),
    ).toBeNull();
  });

  it("doesn't pair a mark sheet's names with an allotted-marks list further along the row", async () => {
    const rows = [
      [
        "",
        "Criteria",
        "Task 1",
        "Marks Awarded",
        "",
        "Criteria",
        "Marks Allotted",
      ],
      ["Ann", "Lee", 4, 4, "", "Research", 5],
      ["Ben", "Ray", 5, 5, "", "Poster", 5],
    ];
    const found = await readExcelRubrics(xlsx([{ name: "Class", rows }]));
    expect(found.map((f) => f.criteria.map((c) => c.name))).toEqual([
      ["Research", "Poster"],
    ]);
  });

  it("doesn't read a scale legend that counts down as criteria", () => {
    expect(
      readAllottedMarks([
        ["Criteria", "Marks Allotted"],
        ["Excellent", "5"],
        ["Good", "4"],
        ["Fair", "3"],
      ]),
    ).toBeNull();
  });
});

describe("titles from the lines above a table", () => {
  it("skip form fields, dates and numbers", () => {
    expect(
      titleAbove([
        ["Project rubric"],
        ["Name: A Student"],
        ["01/02/2026"],
        ["12"],
      ]),
    ).toBe("Project rubric");
    expect(titleAbove([["Name: A Student"]])).toBe("");
  });
});
