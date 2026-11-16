import { describe, expect, it } from "vitest";
import { criteriaChanged, initialCriteria } from "../rubricCriteria";
import type { RubricCriterion } from "@/types/assessment";

// The rubric form's starting grid and its "has the grid changed" check, moved out of RubricForm.tsx unchanged.

const crit = (id: string, name = "Content"): RubricCriterion => ({
  id,
  name,
  maxPoints: 4,
  levels: [{ label: "Good", points: 4 }],
});

describe("initialCriteria", () => {
  it("starts from the saved grid", () => {
    const saved = [crit("a"), crit("b")];
    expect(initialCriteria(saved, false)).toEqual(saved);
    expect(initialCriteria(saved, true)).toEqual(saved);
  });

  it("starts empty for a rubric that holds a file and has no grid", () => {
    expect(initialCriteria(undefined, true)).toEqual([]);
    expect(initialCriteria([], true)).toEqual([]);
  });

  it("starts with one blank criterion otherwise", () => {
    const [only, ...rest] = initialCriteria(undefined, false);
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ name: "", maxPoints: 0 });
  });
});

describe("criteriaChanged", () => {
  it("is false for the saved grid, and for an empty grid with none saved", () => {
    expect(criteriaChanged([crit("a")], [crit("a")])).toBe(false);
    expect(criteriaChanged([], undefined)).toBe(false);
  });

  it("is true once anything differs", () => {
    expect(criteriaChanged([crit("a", "Style")], [crit("a")])).toBe(true);
    expect(criteriaChanged([crit("a")], undefined)).toBe(true);
  });
});
