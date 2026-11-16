import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextPiece } from "../pdfLines";
import { rubricsFromPdf } from "../rubricPdf";
import { pdfTable } from "../rubricPdfTables";
import { readSharedScale } from "../rubricLayouts";

// Reading rubrics from a PDF's text layer (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D21). The table builder is tested on
// pieces placed by hand, and the whole reader on small PDFs written here, read with the real pdf.js under Node.

type Placed = [x: number, y: number, text: string];

/** Pieces as pdf.js reports them, for text at given positions in 10-point Helvetica (about 5 units a character). */
const pieces = (placed: readonly Placed[], height = 10): TextPiece[] =>
  placed.map(([x, y, str]) => ({ str, x, y, width: str.length * 5, height }));

/** A small text PDF with text at the given positions on each page, in 10-point Helvetica. */
function makePositionedPdf(pages: readonly (readonly Placed[])[]): Uint8Array {
  const escape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((placed, i) => {
    const stream = placed
      .map(
        ([x, y, text]) => `BT /F1 10 Tf ${x} ${y} Td (${escape(text)}) Tj ET`,
      )
      .join("\n");
    objects[4 + i * 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objects[5 + i * 2] =
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1)
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

const ALLOTTED_PAGE: Placed[] = [
  [200, 740, "Science fair rubric"],
  [72, 700, "Name: ____________"],
  [72, 680, "Read each criterion carefully before you mark the work."],
  [80, 640, "Criteria"],
  [240, 640, "Marks Allotted"],
  [390, 640, "Marks Awarded"],
  [80, 615, "Research"],
  [240, 615, "10"],
  [80, 590, "Display"],
  [240, 590, "5"],
  [80, 565, "Total"],
  [240, 565, "15 marks"],
  [72, 520, "Comments: __________"],
];

const SCALE_PAGE: Placed[] = [
  [80, 640, "Criteria"],
  [240, 640, "Rating scale"],
  [390, 640, "Marks Awarded"],
  [80, 615, "Voice - clear and"],
  [240, 615, "3. Strong"],
  [80, 605, "audible"],
  [80, 585, "Pace"],
  [240, 585, "2. Steady"],
  [80, 560, "Eye contact"],
  [240, 560, "1. Weak"],
  [80, 535, "Structure"],
  [240, 535, "U. Unclear"],
  [80, 510, "Total"],
  [240, 510, "(12 marks)"],
];

describe("a table from a PDF page", () => {
  it("takes its columns from the header, and ends at a line starting left of it", () => {
    const table = pdfTable(pieces(ALLOTTED_PAGE), 1)!;
    expect(table.source).toBe("Page 1");
    expect(table.rows).toEqual([
      ["Science fair rubric"],
      ["Name: ____________"],
      ["Criteria", "Marks Allotted", "Marks Awarded"],
      ["Research", "10", ""],
      ["Display", "5", ""],
      ["Total", "15 marks", ""],
    ]);
  });

  it("joins a line close under the one above into the same row, on a new line", () => {
    const table = pdfTable(pieces(SCALE_PAGE), 2)!;
    expect(table.rows[1]).toEqual([
      "Voice - clear and\naudible",
      "3. Strong",
      "",
    ]);
  });

  it("never offers a sentence or a long line above the table as a title", () => {
    const rows = pdfTable(pieces(ALLOTTED_PAGE), 1)!.rows;
    expect(rows.flat()).not.toContain(
      "Read each criterion carefully before you mark the work.",
    );
  });

  it("finds nothing on a page with no header", () => {
    expect(
      pdfTable(pieces([[72, 700, "Just a letter to parents"]]), 1),
    ).toBeNull();
  });
});

describe("a shared scale with one entry that gives no points", () => {
  it("leaves that entry out, with a warning", () => {
    const read = readSharedScale(pdfTable(pieces(SCALE_PAGE), 1)!.rows)!;
    expect(read.criteria.map((c) => c.levels.map((l) => l.label))).toEqual(
      Array(4).fill(["Strong", "Steady", "Weak"]),
    );
    expect(read.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/gave no points/)]),
    );
  });

  it("isn't read at all when more than one entry gives no points", () => {
    const rows = [
      ["Criteria", "Scale"],
      ["Voice", "3. Strong"],
      ["Pace", "2. Steady"],
      ["Eye", "A. One"],
      ["Order", "B. Two"],
    ];
    expect(readSharedScale(rows)).toBeNull();
  });
});

describe("reading a PDF with the real pdf.js", () => {
  it("gives one rubric per page with a table, with no student data and a short title", async () => {
    const found = await rubricsFromPdf(
      pdfjs,
      makePositionedPdf([ALLOTTED_PAGE, SCALE_PAGE]),
    );
    expect(
      found.map((f) => [
        f.source,
        f.heading,
        f.criteria.map((c) => [c.name, c.maxPoints, c.levels.length]),
      ]),
    ).toEqual([
      [
        "Page 1",
        "Science fair rubric",
        [
          ["Research", 10, 0],
          ["Display", 5, 0],
        ],
      ],
      [
        "Page 2",
        "",
        [
          ["Voice - clear and audible", 3, 3],
          ["Pace", 3, 3],
          ["Eye contact", 3, 3],
          ["Structure", 3, 3],
        ],
      ],
    ]);
    expect(JSON.stringify(found)).not.toMatch(/Name:|Comments|Marks Awarded/);
  });

  it("gives nothing for a PDF with no text, such as a scan", async () => {
    expect(await rubricsFromPdf(pdfjs, makePositionedPdf([[]]))).toEqual([]);
  });
});
