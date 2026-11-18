import { describe, expect, it } from "vitest";
import {
  FILLABLE_STATES,
  isFillable,
  missingBySession,
  studentsToFill,
  fillCounts,
  unmarkedNames,
  unmarkedStudents,
} from "../attendanceMissing";

const students = [
  { uid: "u3", name: "Cy Ng" },
  { uid: "u1", name: "Ann Lee" },
  { uid: "u2", name: "Bo Kim" },
];

describe("unmarkedStudents", () => {
  it("lists only the students with no state, A-Z by name", () => {
    const marked = new Set(["u2"]);
    expect(
      unmarkedStudents(students, (uid) => marked.has(uid)).map((s) => s.name),
    ).toEqual(["Ann Lee", "Cy Ng"]);
  });

  it("is empty when everyone is marked, and everyone when no one is", () => {
    expect(unmarkedNames(students, () => true)).toEqual([]);
    expect(unmarkedNames(students, () => false)).toEqual([
      "Ann Lee",
      "Bo Kim",
      "Cy Ng",
    ]);
  });

  it("does not reorder or mutate the input", () => {
    const copy = students.map((s) => ({ ...s }));
    unmarkedNames(students, () => false);
    expect(students).toEqual(copy);
  });
});

describe("missingBySession", () => {
  it("returns one entry per incomplete session, with names, in session order", () => {
    const result = missingBySession(students, [
      { label: "AM Oct 01", hasRecord: (uid) => uid !== "u1" },
      { label: "PM Oct 01", hasRecord: () => true },
      { label: "AM Oct 02", hasRecord: (uid) => uid === "u2" },
    ]);
    expect(result).toEqual([
      { label: "AM Oct 01", names: ["Ann Lee"] },
      { label: "AM Oct 02", names: ["Ann Lee", "Cy Ng"] },
    ]);
  });

  it("is empty when every session is complete", () => {
    expect(
      missingBySession(students, [{ label: "AM", hasRecord: () => true }]),
    ).toEqual([]);
  });
});

describe("bulk fill", () => {
  // u1 is Absent, u2 is Present, u3 has no mark.
  const states: Record<string, string> = { u1: "A", u2: "P" };
  const stateOf = (uid: string) => states[uid];
  const uids = (list: { uid: string }[]) => list.map((s) => s.uid);

  it("fills only students with no state yet", () => {
    expect(uids(studentsToFill(students, stateOf, "empty", "P"))).toEqual([
      "u3",
    ]);
  });

  it("overwrites the students marked differently, and never one who already has the state", () => {
    expect(uids(studentsToFill(students, stateOf, "all", "P"))).toEqual([
      "u3",
      "u1",
    ]);
    // A column already all Present has nothing to change, so no draft and no save.
    expect(studentsToFill(students, () => "P", "all", "P")).toEqual([]);
    expect(studentsToFill(students, () => "P", "empty", "P")).toEqual([]);
  });

  it("counts the empty, the differently marked and the Excused students for the confirm dialog", () => {
    expect(fillCounts(students, stateOf, "P")).toEqual({
      emptyCount: 1,
      markedCount: 1,
      excusedCount: 0,
    });
    expect(fillCounts(students, () => "E", "P")).toEqual({
      emptyCount: 0,
      markedCount: 3,
      excusedCount: 3,
    });
    expect(fillCounts(students, () => "P", "P")).toEqual({
      emptyCount: 0,
      markedCount: 0,
      excusedCount: 0,
    });
  });

  it("offers every state except Excused, which needs a reason per student", () => {
    expect(FILLABLE_STATES).toEqual(["P", "A", "L", "S", "B"]);
    expect(isFillable("E")).toBe(false);
    for (const s of FILLABLE_STATES) expect(isFillable(s)).toBe(true);
  });
});
