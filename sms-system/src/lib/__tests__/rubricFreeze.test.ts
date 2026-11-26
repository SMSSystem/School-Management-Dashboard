import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  frozenRubricNote,
  retryWithoutFreeze,
  rubricFromFrozen,
  saveWithFreezeRetry,
  rubricToFreeze,
} from "../rubricFreeze";
import { frozenRubricTitle, rubricPickerOptions } from "../assignmentFormLogic";
import gradingRaw from "../grading.ts?raw";
import recordRaw from "../../hooks/useAssignmentRecord.ts?raw";
import { flat } from "./sourceText";

// Freezing an assignment's rubric at the first grade (RUBRICS_UPLOAD_SPEC.md section 6.13), and the picker that keeps
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
      rubricToFreeze({ rubricId: "r1", rubricFrozenAt: {} }, live),
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
      frozenRubricTitle({
        rubricFrozenAt: {},
        rubricFrozenTitle: "Essay rubric",
      } as never),
    ).toBe("Essay rubric");
    expect(frozenRubricTitle({ rubricFrozenAt: {} } as never)).toBe(
      "Untitled rubric",
    );
    expect(frozenRubricTitle({ rubricId: "r1" })).toBeUndefined();
  });
});

describe("the wiring", () => {
  it("freezes in the grading batch: the grid in rubric/frozen, and only a marker on the assignment", () => {
    const src = flat(gradingRaw);
    const freeze = src.indexOf(
      flat("const freeze = rubricToFreeze(assignment, rubric);"),
    );
    expect(freeze).toBeGreaterThan(-1);
    const grid = src.indexOf(
      flat(
        'batch.set(institutionSubdoc(institutionId, "assignments", assignment.id, "rubric", "frozen"), {',
      ),
    );
    expect(grid).toBeGreaterThan(freeze);
    expect(src).toContain(
      flat(
        "batch.update(assignmentRef, { rubricFrozenAt: serverTimestamp(), rubricFrozenTitle: frozen.title });",
      ),
    );
    expect(src.indexOf("await batch.commit();")).toBeGreaterThan(grid);
    expect(src).not.toContain("rubricFrozen:");
  });

  it("saves the grade through the retry", () => {
    expect(flat(gradingRaw)).toContain(flat("await saveWithFreezeRetry("));
  });

  it("reads the frozen grid, not the shared rubric, once frozen", () => {
    const src = flat(recordRaw);
    expect(src).toContain(
      flat(
        'institutionSubdoc(institutionId, "assignments", assignment.id, "rubric", "frozen"),',
      ),
    );
    expect(src.indexOf(flat("if (frozen) {"))).toBeLessThan(
      src.indexOf(
        flat('institutionDoc(institutionId, "rubrics", assignment.rubricId),'),
      ),
    );
  });
});

describe("retryWithoutFreeze", () => {
  const denied = { code: "permission-denied" };

  it("retries only a refused freeze on an assignment that is frozen now", () => {
    expect(retryWithoutFreeze(denied, true, true)).toBe(true);
  });

  it("doesn't retry without a freeze, before anyone froze it, or for another error", () => {
    expect(retryWithoutFreeze(denied, false, true)).toBe(false);
    expect(retryWithoutFreeze(denied, true, false)).toBe(false);
    expect(retryWithoutFreeze({ code: "unavailable" }, true, true)).toBe(false);
    expect(retryWithoutFreeze(null, true, true)).toBe(false);
  });
});

describe("saveWithFreezeRetry", () => {
  const denied = Object.assign(new Error("denied"), {
    code: "permission-denied",
  });

  it("saves once, with the freeze, when that works", async () => {
    const saves: unknown[] = [];
    await saveWithFreezeRetry(
      "grid",
      async (f) => void saves.push(f),
      async () => false,
    );
    expect(saves).toEqual(["grid"]);
  });

  it("saves again without the freeze when another grader froze it first", async () => {
    const saves: unknown[] = [];
    const save = async (f: string | null) => {
      saves.push(f);
      if (f) throw denied;
    };
    await saveWithFreezeRetry("grid", save, async () => true);
    expect(saves).toEqual(["grid", null]);
  });

  it("throws, without saving again, when nobody froze it or there was no freeze", async () => {
    const failing = async () => {
      throw denied;
    };
    await expect(
      saveWithFreezeRetry("grid", failing, async () => false),
    ).rejects.toBe(denied);
    await expect(
      saveWithFreezeRetry(null, failing, async () => true),
    ).rejects.toBe(denied);
  });
});
