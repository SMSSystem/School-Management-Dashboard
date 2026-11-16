import { describe, expect, it } from "vitest";
import hookRaw from "../../hooks/useRubricsList.ts?raw";
import formOptionsRaw from "../../hooks/useAssignmentFormOptions.ts?raw";
import pageRaw from "../../scenes/(dashboard)/list/rubrics/index.tsx?raw";
import persistenceRaw from "../queryPersistence.ts?raw";

// One shared live listener serves the Rubrics page and the assignment form's picker
// (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D24), so opening one after the other reads nothing. Kept in memory only.

const norm = (s: string) => s.replace(/\s+/g, " ");

describe("the shared rubric list", () => {
  it("is one shared listener, keyed by school", () => {
    const hook = norm(hookRaw);
    expect(hook).toContain("subscribeSnapshot( `rubrics:${institutionId}`,");
    expect(hook).not.toMatch(/\bgetDocs\(|\bonSnapshot\(/);
  });

  it("serves the Rubrics page and the assignment form, neither reading on its own", () => {
    expect(norm(pageRaw)).toContain("useRubricsList()");
    expect(pageRaw).not.toMatch(/\bonSnapshot\(|\bgetDocs\(/);
    expect(norm(formOptionsRaw)).toContain("useRubricsList({ quiet: true })");
    expect(formOptionsRaw).not.toMatch(
      /institutionCollection\(institutionId, "rubrics"\)/,
    );
  });

  it("is never kept across a reload", () => {
    expect(persistenceRaw).not.toMatch(/['"]rubrics['"]/);
  });
});
