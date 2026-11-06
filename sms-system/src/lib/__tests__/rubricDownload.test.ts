import { strFromU8 } from "fflate";
import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import { extractEntry, indexZip } from "../docxZip";
import { buildExampleDocx } from "../exampleDocx";
import {
  rubricFileBase,
  rubricToMarkdown,
  rubricToTable,
} from "../rubricTable";
import { checkRubricBytes } from "../rubricFile";
import { rubricToDocx } from "../rubricWordFile";
import { rowsToXLSXSheet } from "../spreadsheetExport";
import storeRaw from "../rubricFileStore.ts?raw";
import deleteRaw from "../deleteRecord.ts?raw";
import menuRaw from "../../components/rubric/RubricDownloadMenu.tsx?raw";
import sectionRaw from "../../scenes/(dashboard)/list/assignments/[id]/RubricSection.tsx?raw";
import pageRaw from "../../scenes/(dashboard)/list/rubrics/index.tsx?raw";
import uploadRaw from "../../components/rubric/RubricUploadDialog.tsx?raw";
import formRaw from "../../components/forms/RubricForm.tsx?raw";
import criteriaRaw from "../rubricCriteria.ts?raw";
import importReadRaw from "../rubricImportRead.ts?raw";
import actionsRaw from "../../components/rubric/RubricFileActions.tsx?raw";
import routesRaw from "../../routes/academicRoutes.tsx?raw";
import type { RubricCriterion } from "@/types/assessment";

// A rubric's generated downloads, read back, and how a stored file is wired into the pages and the delete
// (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md sections 9 and 13.4).

const norm = (s: string) => s.replace(/\s+/g, " ");
const LEVELS = [
  { label: "Excellent", points: 4, description: "Clear & complete" },
  { label: "Good", points: 3 },
];
const crit = (name: string, levels = LEVELS): RubricCriterion => ({
  id: name,
  name,
  maxPoints: 4,
  levels,
});
const rubric = {
  title: "Oral: Term 1/2",
  description: "For talks",
  criteria: [crit("Voice"), crit("Content")],
};

describe("the table", () => {
  it("uses the levels as columns when every criterion shares them", () => {
    expect(rubricToTable(rubric)).toEqual([
      ["Criterion", "Max points", "Excellent (4)", "Good (3)"],
      ["Voice", "4", "Clear & complete", ""],
      ["Content", "4", "Clear & complete", ""],
    ]);
  });

  it("numbers the columns, and names each level, when they differ", () => {
    const table = rubricToTable({
      criteria: [crit("A"), crit("B", [{ label: "Met", points: 1 }])],
    });
    expect(table[0]).toEqual(["Criterion", "Max points", "Level 1", "Level 2"]);
    expect(table[1][2]).toBe("Excellent (4): Clear & complete");
    expect(table[2]).toEqual(["B", "4", "Met (1)", ""]);
  });

  it("copes with no criteria", () => {
    expect(rubricToTable({ criteria: [] })).toEqual([
      ["Criterion", "Max points"],
    ]);
  });
});

describe("Markdown", () => {
  it("has the title, the description and a pipe table", () => {
    const md = rubricToMarkdown(rubric);
    expect(md.startsWith("# Oral: Term 1/2\n\nFor talks\n\n")).toBe(true);
    expect(md).toContain(
      "| Criterion | Max points | Excellent (4) | Good (3) |\n| --- | --- | --- | --- |",
    );
    expect(md).toContain("| Voice | 4 | Clear & complete |  |");
  });

  it("escapes what would break a cell", () => {
    const md = rubricToMarkdown({
      title: "T",
      criteria: [
        crit("A|B", [{ label: "L", points: 1, description: "x\ny|z" }]),
      ],
    });
    expect(md).toContain("A\\|B");
    expect(md).toContain("x y\\|z");
  });
});

describe("the file name", () => {
  it("is safe to save", () => {
    expect(rubricFileBase("Oral: Term 1/2")).toBe("Oral-Term-1-2");
    expect(rubricFileBase("  ?? ")).toBe("rubric");
    expect(rubricFileBase("a".repeat(200))).toHaveLength(100);
  });
});

describe("the Word file", () => {
  const bytes = rubricToDocx(rubric);
  const xml = strFromU8(
    extractEntry(bytes, indexZip(bytes).get("word/document.xml")!, 1_000_000),
  );

  it("passes the app’s own check for a real Word file", () => {
    expect(checkRubricBytes("word", bytes)).toEqual([]);
  });

  it("holds the title, the description and a table with every cell", () => {
    expect(xml).toContain("Oral: Term 1/2");
    expect(xml).toContain("For talks");
    expect(xml.match(/<w:tr>/g)).toHaveLength(3);
    expect(xml.match(/<w:tc>/g)).toHaveLength(12);
    expect(xml.match(/<w:gridCol\/>/g)).toHaveLength(4);
  });

  it("escapes XML, and ends the table with a paragraph, as Word requires", () => {
    expect(xml).toContain("Clear &amp; complete");
    expect(xml).toContain("</w:tbl><w:p/>");
  });

  it("leaves the exam’s example file a valid Word file", () => {
    expect(checkRubricBytes("word", buildExampleDocx())).toEqual([]);
  });
});

describe("the Excel file", () => {
  const excel = (table: string[][]) => {
    const [header, ...rows] = table;
    const columns = header.map((text, i) => ({
      header: text,
      accessor: (row: string[]) => row[i],
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      rowsToXLSXSheet(rows, columns),
      "Rubric",
    );
    return new Uint8Array(
      XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    );
  };

  it("reads back as the same table", () => {
    const book = XLSX.read(excel(rubricToTable(rubric)), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Rubric, {
      header: 1,
      defval: "",
    });
    expect(rows).toEqual(rubricToTable(rubric));
  });

  it("keeps a cell that starts with = as text, not a formula", () => {
    const table = rubricToTable({ criteria: [crit('=HYPERLINK("x")')] });
    const bytes = excel(table);
    expect(checkRubricBytes("sheet", bytes)).toEqual([]);
    const book = XLSX.read(bytes, { type: "array", cellFormula: true });
    expect(book.Sheets.Rubric.A2.f).toBeUndefined();
    expect(book.Sheets.Rubric.A2.t).toBe("s");
  });
});

describe("how a stored file is wired", () => {
  it("loads the file checks only when a file is chosen, so the zip library stays out of the page", () => {
    expect(norm(importReadRaw)).toContain('await import("./rubricFile")');
    expect(importReadRaw).not.toMatch(
      /^import (?!type)[^\n]*from "\.\/rubricFile";/m,
    );
    for (const text of [uploadRaw, actionsRaw]) {
      expect(norm(text)).toMatch(/await chooseRubricFile\(\w+\)/);
      expect(text).not.toMatch(
        /^import (?!type)[^\n]*from "@\/lib\/rubricFile";/m,
      );
    }
  });

  const store = norm(storeRaw);

  it("writes each change in one batch, with an audit entry", () => {
    for (const fn of [
      "createRubricFromFile",
      "replaceRubricFile",
      "removeRubricFile",
    ]) {
      const body = store.slice(store.indexOf(`function ${fn}`));
      const end = body.indexOf("await batch.commit()");
      expect(body.slice(0, end), fn).toContain("writeBatch(db)");
      expect(body.slice(0, end), fn).toMatch(
        /addAudit\(\s*batch,\s*p\.institutionId/,
      );
    }
  });

  it("keeps the body out of the rubric document", () => {
    const summary = store.slice(
      store.indexOf("const summaryOf"),
      store.indexOf("const bodyOf"),
    );
    expect(summary).not.toContain("dataUrl");
  });

  it("never goes through React Query", () => {
    expect(store).not.toContain("useQuery");
    expect(store).not.toContain("react-query");
  });

  it("deletes the file with the rubric, which Firestore would not do itself", () => {
    expect(norm(deleteRaw)).toContain(
      'if (table === "rubric") { await deleteRubricAndFile(institutionId, id, actor); return; }',
    );
    const body = store.slice(store.indexOf("function deleteRubricAndFile"));
    expect(body).toContain("batch.delete(fileRef(rubric))");
    expect(body).toContain("batch.delete(rubric)");
    expect(body.indexOf("getDoc(rubric)")).toBeLessThan(
      body.indexOf("writeBatch(db)"),
    );
  });

  it("fetches the original only when it is chosen", () => {
    const menu = norm(menuRaw);
    expect(menu.indexOf("fetchRubricFile(")).toBeGreaterThan(
      menu.indexOf("const original = () =>"),
    );
  });

  it("shows downloads by role on the assignment page, and tells a read-only account why there is nothing", () => {
    const section = norm(sectionRaw);
    expect(section).toContain(
      "{canDownload && <RubricDownloadMenu rubric={rubric} labelled />}",
    );
    expect(section).toContain("Not available on a read-only account.");
  });

  it("decides the page’s controls by role helpers, and keeps the button the e2e fixtures use", () => {
    const page = norm(pageRaw);
    expect(page).toContain(
      "canDownload && <RubricDownloadMenu rubric={item} />",
    );
    expect(page).toContain("canDeleteRubric(role, user?.uid, item)");
    expect(page).toContain('<FormModal table="rubric" type="create" />');
  });

  it("lets a rubric with a file be saved with no grid, but not one without", () => {
    const form = norm(formRaw);
    expect(form).toContain("validateCriteria(criteria, hasFile)");
    expect(norm(criteriaRaw)).toContain(
      'return hasFile ? null : "At least one criterion is required."',
    );
    expect(form).toContain(
      "...(gridChanged && { updatedAt: serverTimestamp() })",
    );
  });

  it("does not offer to remove the only form a rubric has", () => {
    expect(norm(actionsRaw)).toContain("disabled={fileOnly}");
  });

  it("guards the route for super_admin too", () => {
    expect(norm(routesRaw)).toContain(
      "canOpenRubrics(role) ? ( <RubricsListPage />",
    );
  });
});
