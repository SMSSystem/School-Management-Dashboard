import { strToU8, zipSync } from "fflate";
import * as XLSX from "@e965/xlsx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RubricFileConfirm from "../../components/rubric/RubricFileConfirm";
import uploadRaw from "../../components/rubric/RubricUploadDialog.tsx?raw";
import actionsRaw from "../../components/rubric/RubricFileActions.tsx?raw";
import storeRaw from "../rubricFileStore.ts?raw";
import {
  processRubricFile,
  RubricFileError,
  sheetsToCheck,
  workbookSheets,
} from "../rubricFile";
import { RUBRIC_FILE_CONFIRMATION } from "../rubricFileKinds";

// What a teacher must see and confirm before a rubric file is saved (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D13): the
// whole file is stored and can be downloaded, and a mark sheet beside a rubric is easy to forget. Uses real generated workbooks.

const norm = (s: string) => s.replace(/\s+/g, " ");

function workbook(sheets: { name: string; hidden?: 1 | 2 }[]): Uint8Array {
  const book = XLSX.utils.book_new();
  for (const { name } of sheets)
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["a"]]), name);
  book.Workbook = {
    Sheets: sheets.map(({ hidden }) => ({ Hidden: hidden ?? 0 })),
  };
  return new Uint8Array(
    XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
  );
}
const zipWithWorkbook = (xml: string) =>
  zipSync({ "xl/workbook.xml": strToU8(xml) });

describe("a workbook's sheets", () => {
  it("are read in order, with their names", () => {
    expect(
      workbookSheets(workbook([{ name: "Rubric" }, { name: "Marks" }])),
    ).toEqual([
      { name: "Rubric", hidden: false },
      { name: "Marks", hidden: false },
    ]);
  });

  it("notice hidden and very hidden sheets", () => {
    expect(
      workbookSheets(
        workbook([
          { name: "A" },
          { name: "B", hidden: 1 },
          { name: "C", hidden: 2 },
        ]),
      ).map((s) => s.hidden),
    ).toEqual([false, true, true]);
  });

  it("decode names, so a teacher sees what Excel shows", () => {
    expect(
      workbookSheets(workbook([{ name: "Marks & <Grades>" }]))[0].name,
    ).toBe("Marks & <Grades>");
    const xml = `<workbook><sheets><sheet name="O&apos;Neil &#233;" sheetId="1"/><x:sheet name='Two' state='hidden' sheetId="2"/></sheets></workbook>`;
    expect(workbookSheets(zipWithWorkbook(xml))).toEqual([
      { name: "O'Neil é", hidden: false },
      { name: "Two", hidden: true },
    ]);
  });

  it("don't mistake the sheets list or another attribute for a sheet", () => {
    const xml = `<workbook><sheets count="1"><sheet sheetId="1" name="Only" othername="x" state="visible"/></sheets></workbook>`;
    expect(workbookSheets(zipWithWorkbook(xml))).toEqual([
      { name: "Only", hidden: false },
    ]);
  });

  it("refuse a damaged workbook with a clear message", () => {
    expect(() => workbookSheets(strToU8("not a zip"))).toThrow(RubricFileError);
    expect(() => workbookSheets(zipSync({ "a.xml": strToU8("<a/>") }))).toThrow(
      /real Excel/,
    );
  });
});

describe("which sheets to check", () => {
  const visible = (name: string) => ({ name, hidden: false });

  it("is none for one visible sheet", () => {
    expect(sheetsToCheck([visible("Rubric")])).toEqual([]);
    expect(sheetsToCheck([])).toEqual([]);
  });

  it("is all of them when there are two or more", () => {
    expect(
      sheetsToCheck([visible("Rubric"), visible("Marks")]).map((s) => s.name),
    ).toEqual(["Rubric", "Marks"]);
  });

  it("is a lone sheet when it is hidden", () => {
    expect(sheetsToCheck([{ name: "Secret", hidden: true }])).toHaveLength(1);
  });
});

describe("processing a chosen file", () => {
  const fileOf = (bytes: Uint8Array, name: string) =>
    new File([bytes as BlobPart], name);

  it("lists a workbook's sheets when there are several", async () => {
    const out = await processRubricFile(
      fileOf(
        workbook([{ name: "Rubric" }, { name: "Marks", hidden: 1 }]),
        "r.xlsx",
      ),
    );
    expect(out.sheetsToCheck).toEqual([
      { name: "Rubric", hidden: false },
      { name: "Marks", hidden: true },
    ]);
  });

  it("lists nothing for one sheet, or for another kind of file", async () => {
    expect(
      (
        await processRubricFile(
          fileOf(workbook([{ name: "Rubric" }]), "r.xlsx"),
        )
      ).sheetsToCheck,
    ).toEqual([]);
    expect(
      (await processRubricFile(fileOf(strToU8("# Rubric"), "r.md")))
        .sheetsToCheck,
    ).toEqual([]);
  });
});

describe("the confirmation", () => {
  const render = (
    sheets: { name: string; hidden: boolean }[],
    confirmed = false,
  ) =>
    renderToStaticMarkup(
      createElement(RubricFileConfirm, {
        sheets,
        confirmed,
        disabled: false,
        onChange: () => undefined,
      }),
    );

  it("asks about student data on every file, even with no sheets to list", () => {
    const html = render([]);
    expect(html).toContain("no student names, marks or answer keys");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("workbook has");
  });

  it("names every sheet and marks the hidden ones", () => {
    const html = render([
      { name: "Rubric", hidden: false },
      { name: "Class marks", hidden: true },
    ]);
    expect(html).toContain("This workbook has 2 sheets");
    expect(html).toContain("<li>Rubric</li>");
    expect(html).toContain("<li>Class marks (hidden)</li>");
  });

  it("shows a sheet's name as text, not markup", () => {
    const html = render([{ name: "<img src=x>", hidden: false }]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("says who can download the file", () => {
    expect(RUBRIC_FILE_CONFIRMATION).toContain(
      "Students and parents can download it exactly as it is.",
    );
  });
});

describe("how it is wired", () => {
  const upload = norm(uploadRaw);
  const actions = norm(actionsRaw);

  it("keeps Upload off until the file is confirmed", () => {
    expect(upload).toContain("ready={!!chosen && confirmed}");
    expect(upload).toContain("disabled={!ready || saving}");
    expect(upload).toContain(
      "if (!chosen || !confirmed || !actor || !institutionId || !titleOk()) return;",
    );
  });

  it("clears the tick when another file is chosen", () => {
    expect(upload).toMatch(/setChosen\(null\); setConfirmed\(false\);/);
  });

  it("keeps Replace and Attach off until the file is confirmed", () => {
    expect(actions).toContain("ready={confirmed}");
    expect(actions).toContain("disabled={!ready || busy}");
    expect(actions).toContain("<RubricFileConfirm");
  });

  it("offers a read grid only behind the same tick, and never applies one without a review", () => {
    expect(upload).toContain("onSaveFile={() => void save([])}");
    expect(actions).toContain("onReview={() => setReviewing(true)}");
    expect(actions).toContain("onFileOnly={() => onConfirm()}");
    expect(actions).toContain("onSave={() => onConfirm(criteria)}");
  });

  it("never stores the list of sheets", () => {
    expect(storeRaw).not.toContain("sheetsToCheck");
  });
});
