import { describe, expect, it } from "vitest";
import { flat } from "./sourceText";
import { ALL } from "../listFilters";
import { filterRubrics, RUBRIC_TYPE_OPTIONS } from "../rubricList";
import { rubricTourSteps } from "../rubricTourSteps";
import tourStepsRaw from "../useTourSteps.ts?raw";
import pageRaw from "../../scenes/(dashboard)/list/rubrics/index.tsx?raw";
import uploadRaw from "../../components/rubric/RubricUploadDialog.tsx?raw";
import templateRaw from "../../components/rubric/RubricTemplateMenu.tsx?raw";
import sectionRaw from "../../scenes/(dashboard)/list/assignments/[id]/RubricSection.tsx?raw";
import type { Role } from "@/types/people";

// The Rubrics page's search and Type filter, its tour, and the help students and parents see on an assignment
// (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md items 2.11 to 2.13). A tour step whose target has gone shows its
// spotlight in the wrong place, and nothing else would notice, so every target is pinned to the page's source.

const norm = (s: string) => s.replace(/\s+/g, " ");
const file = {
  fileName: "f.pdf",
  mimeType: "application/pdf",
  size: 1,
  uploadedBy: "u",
  uploadedByName: "U",
} as never;
const level = { label: "Good", points: 3 };
const crit = { id: "c", name: "C", maxPoints: 3, levels: [level] };
const rubrics = [
  {
    title: "Oral  Presentation",
    description: "Term 1 speaking",
    criteria: [crit],
  },
  { title: "Essay", criteria: [crit], file },
  { title: "Lab report", description: "Science", criteria: [], file },
];

describe("filterRubrics", () => {
  const titles = (search: string, type = ALL) =>
    filterRubrics(rubrics, { search, type }).map((r) => r.title);

  it("matches everything with no search and any type", () => {
    expect(titles("")).toHaveLength(3);
    expect(titles("   ")).toHaveLength(3);
  });

  it("searches the title and description, ignoring case and spacing", () => {
    expect(titles("oral presentation")).toEqual(["Oral  Presentation"]);
    expect(titles("SCIENCE")).toEqual(["Lab report"]);
    expect(titles("term speaking")).toEqual(["Oral  Presentation"]);
    expect(titles("missing")).toEqual([]);
  });

  it("filters by the Type column's words", () => {
    expect(RUBRIC_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      "Grid",
      "Grid + file",
      "File only",
    ]);
    expect(titles("", "Grid")).toEqual(["Oral  Presentation"]);
    expect(titles("", "Grid + file")).toEqual(["Essay"]);
    expect(titles("", "File only")).toEqual(["Lab report"]);
    expect(titles("essay", "File only")).toEqual([]);
  });

  it("is wired to the page, which counts and pages the filtered list", () => {
    const page = norm(pageRaw);
    expect(page).toContain("filterRubrics(rubrics, { search, type })");
    expect(page).toContain("total={shown.length}");
    expect(page).toContain("setPage(1);");
  });
});

describe("the rubrics tour", () => {
  const sources = norm(pageRaw + uploadRaw + templateRaw);
  const selectors = (role: Role) =>
    rubricTourSteps(role)
      .map((s) => s.selector)
      .filter(Boolean) as string[];

  it("is registered, and started by the page's own button", () => {
    expect(tourStepsRaw).toContain(
      "{ tour: 'rubrics', steps: rubricTourSteps(role) }",
    );
    expect(norm(pageRaw)).toContain('startNextStep("rubrics")');
  });

  it.each<Role>([
    "institution_admin",
    "senior_teacher",
    "regular_teacher",
    "spectator",
  ])("targets only ids on the page, for %s", (role) => {
    for (const selector of selectors(role))
      expect(sources).toContain(`id="${selector.slice(1)}"`);
  });

  it("never routes away or waits on an action", () => {
    for (const s of rubricTourSteps("regular_teacher")) {
      expect(s.nextRoute).toBeUndefined();
      expect(s.prevRoute).toBeUndefined();
    }
  });

  it("gives staff eight steps, and a read-only account only the viewing ones", () => {
    expect(rubricTourSteps("regular_teacher")).toHaveLength(8);
    const viewer = rubricTourSteps("spectator");
    expect(viewer.map((s) => s.title)).toEqual([
      "Rubrics",
      "The library",
      "Viewing rubrics",
    ]);
    expect(selectors("spectator")).toEqual(["#tour-rubrics-table"]);
    expect(viewer[viewer.length - 1].content).toMatch(
      /Downloads aren't available/,
    );
  });

  it("words the row actions by role", () => {
    const actions = (role: Role) =>
      String(
        rubricTourSteps(role).find((s) => s.title === "Row actions")!.content,
      );
    expect(actions("institution_admin")).toMatch(/any rubric/);
    expect(actions("senior_teacher")).toMatch(
      /only the person who uploaded a file/,
    );
    expect(actions("regular_teacher")).toBe(actions("senior_teacher"));
  });
});

describe("help for students and parents", () => {
  const section = norm(sectionRaw);

  it("is shown to students and parents only, as plain text", () => {
    expect(section).toContain('(role === "student" || role === "parent") && (');
    expect(section).toContain(
      "Download the rubric to see how this work will be marked.",
    );
    expect(section).toContain("or swipe on a phone");
  });

  it("folds the section like an accordion for students and parents, closed at first, and leaves staff the open card", () => {
    expect(section).toContain(
      'const foldable = role === "student" || role === "parent";',
    );
    expect(flat(section)).toContain(
      flat(
        'useState(() => !foldable || getPersistedFilter("assignment-rubric", "open") === "1")',
      ),
    );
    expect(section).toContain("aria-expanded={open}");
    expect(section).toContain("aria-controls={bodyId}");
    expect(section).toContain("{open && (");
  });
});
