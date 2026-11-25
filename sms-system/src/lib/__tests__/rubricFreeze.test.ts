import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  frozenRubricNote,
  rubricFromFrozen,
  rubricToFreeze,
} from "../rubricFreeze";
import { frozenRubricTitle, rubricPickerOptions } from "../assignmentFormLogic";
import gradingRaw from "../grading.ts?raw";
import recordRaw from "../../hooks/useAssignmentRecord.ts?raw";
import { flat } from "./sourceText";

// Freezing an assignment's rubric at the first grade (RUBRICS_UPLOAD_SPEC.md section 13.3), and the picker that keeps
// a deleted or still-loading rubric instead of clearing it. The rules are in rules-tests/assignmentRubricFreeze.

const criteria = [
  {
    id: "c1",
    name: "Content",
    maxPoints: 4,
    levels: [{ label: "Good", points: 4 }],
  },
];
const live = {
  title: "Essay rubric",
  description: "How essays are marked",
  criteria,
};

describe("rubricToFreeze", () => {
  it("copies the rubric's grid the first time", () => {
    expect(rubricToFreeze({ rubricId: "r1" }, live)).toEqual({
      rubricId: "r1",
      title: "Essay rubric",
      description: "How essays are marked",
      criteria,
    });
  });

  it("freezes nothing with no rubric, once frozen, with no rubric loaded, or for a rubric with no grid", () => {
    expect(rubricToFreeze({}, live)).toBeNull();
    expect(
      rubricToFreeze({ rubricId: "r1", rubricFrozen: {} }, live),
    ).toBeNull();
    expect(rubricToFreeze({ rubricId: "r1" }, null)).toBeNull();
    expect(
      rubricToFreeze({ rubricId: "r1" }, { title: "File only", criteria: [] }),
    ).toBeNull();
  });
});

describe("showing a frozen rubric", () => {
  const frozenAt = Timestamp.fromDate(new Date(2026, 10, 20));

  it("is a grid with no stored file", () => {
    const rubric = rubricFromFrozen(
      { rubricId: "r1", title: "Essay rubric", criteria, frozenAt },
      "i1",
    );
    expect(rubric).toMatchObject({
      id: "r1",
      title: "Essay rubric",
      criteria,
      institutionId: "i1",
    });
    expect(rubric).not.toHaveProperty("file");
  });

  it("says when grading started", () => {
    expect(frozenRubricNote(frozenAt)).toBe(
      "This is the rubric as it was when grading started on November 20, 2026. Later changes to the shared rubric don't change it.",
    );
    expect(frozenRubricNote(undefined)).toMatch(
      /^This is the rubric as it was when grading started\. /,
    );
  });
});

describe("the rubric picker", () => {
  const rubrics = [{ id: "r1", title: "Essay rubric" }];

  it("keeps the saved rubric while the list loads, and names one that was deleted", () => {
    expect(rubricPickerOptions([], "r9", true)).toEqual([
      { value: "", label: "None" },
      { value: "r9", label: "Loading rubrics…" },
    ]);
    expect(rubricPickerOptions(rubrics, "r9", false)).toContainEqual({
      value: "r9",
      label: "Deleted rubric (no longer available)",
    });
  });

  it("offers the list as before when the saved rubric is in it, or there is none", () => {
    expect(rubricPickerOptions(rubrics, "r1", false)).toEqual([
      { value: "", label: "None" },
      { value: "r1", label: "Essay rubric" },
    ]);
    expect(rubricPickerOptions([], undefined, false)).toEqual([
      { value: "", label: "No rubrics available yet" },
    ]);
  });

  it("is fixed, by title, once grading started", () => {
    expect(
      frozenRubricTitle({ rubricFrozen: { title: "Essay rubric" } } as never),
    ).toBe("Essay rubric");
    expect(frozenRubricTitle({ rubricId: "r1" })).toBeUndefined();
  });
});

describe("the wiring", () => {
  it("freezes in the grading batch, before the commit", () => {
    const src = flat(gradingRaw);
    const freeze = src.indexOf(
      flat("const freeze = rubricToFreeze(assignment, rubric);"),
    );
    expect(freeze).toBeGreaterThan(-1);
    expect(
      src.indexOf(
        flat("rubricFrozen: { ...freeze, frozenAt: serverTimestamp() }"),
      ),
    ).toBeGreaterThan(freeze);
    expect(src.indexOf("await batch.commit();")).toBeGreaterThan(freeze);
  });

  it("shows the frozen grid and stops reading the shared rubric once frozen", () => {
    const src = flat(recordRaw);
    expect(src).toContain(flat("rubric: frozenRubric ?? rubric"));
    expect(src).toContain(
      flat(
        'if (!institutionId || institutionId === "*" || !assignment?.rubricId || frozenRubric) {',
      ),
    );
  });
});
