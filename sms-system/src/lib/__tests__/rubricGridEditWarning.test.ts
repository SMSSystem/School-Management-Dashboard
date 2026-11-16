import { describe, expect, it } from "vitest";
import formRaw from "../../components/forms/RubricForm.tsx?raw";
import actionsRaw from "../../components/rubric/RubricFileActions.tsx?raw";
import { GRID_SHARED_WARNING } from "../rubricFileKinds";
import { rubricTourSteps } from "../rubricTourSteps";

// A rubric is shared and has no versions (RUBRICS_UPLOAD_SPEC.md section 13.3), so every way of changing its grid
// says that it changes every assignment using it: the file actions did, and now the Edit form does too.

const norm = (s: string) => s.replace(/\s+/g, " ");

describe("the shared-rubric warning on grid edits", () => {
  it("is one sentence, shared by the file actions and the Edit form", () => {
    expect(GRID_SHARED_WARNING).toBe(
      "This changes the grid for every assignment using this rubric, including any already graded.",
    );
    expect(actionsRaw).toContain("GRID_SHARED_WARNING");
    expect(actionsRaw).not.toMatch(/const GRID_SHARED_WARNING/);
  });

  it("shows in the Edit form once the criteria differ from the saved ones, never on create", () => {
    const form = norm(formRaw);
    expect(form).toContain(
      '<GridEditNote editing={type === "update"} criteria={criteria} saved={savedCriteria} />',
    );
    expect(form).toContain(
      "if (!editing || JSON.stringify(criteria) === JSON.stringify(saved ?? [])) return null;",
    );
    expect(formRaw).toContain("{GRID_SHARED_WARNING}");
  });
});

describe("the rubric tour", () => {
  const text = rubricTourSteps("regular_teacher")
    .map((s) => s.content)
    .join(" ");

  it("says a file read into a grid is not kept, and that other layouts and PDFs are read", () => {
    expect(text).toContain(
      "If the app can read a grid from it, only the grid is kept",
    );
    expect(text).toContain("including a PDF with real text");
  });
});
