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
  it("touches only students with no state yet", () => {
    const marked = new Set(["u1"]);
    expect(
      studentsToFill(students, (uid) => marked.has(uid)).map((s) => s.uid),
    ).toEqual(["u3", "u2"]);
    expect(
      studentsToFill(students, (uid) => marked.has(uid), "empty").map(
        (s) => s.uid,
      ),
    ).toEqual(["u3", "u2"]);
  });

  it("overwrites every student when asked to, even a column that is already full", () => {
    expect(
      studentsToFill(students, () => true, "all").map((s) => s.uid),
    ).toEqual(students.map((s) => s.uid));
    expect(studentsToFill(students, () => true)).toEqual([]);
  });

  it("counts the empty and the already marked students for the confirm dialog", () => {
    const marked = new Set(["u1"]);
    expect(fillCounts(students, (uid) => marked.has(uid))).toEqual({
      emptyCount: 2,
      markedCount: 1,
    });
    expect(fillCounts(students, () => true)).toEqual({
      emptyCount: 0,
      markedCount: 3,
    });
  });

  it("offers every state except Excused, which needs a reason per student", () => {
    expect(FILLABLE_STATES).toEqual(["P", "A", "L", "S", "B"]);
    expect(isFillable("E")).toBe(false);
    for (const s of FILLABLE_STATES) expect(isFillable(s)).toBe(true);
  });
});
