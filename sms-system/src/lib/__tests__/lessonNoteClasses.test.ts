import { describe, expect, it } from "vitest";
import { flat } from "./sourceText";
import {
  MAX_LESSON_NOTE_CLASSES,
  classFieldsFor,
  classLabel,
  idGroups,
  isNoteVisibleTo,
  noteClassIds,
  noteClassNames,
} from "../lessonNoteClasses";
import hookRaw from "../../hooks/useLessonNotes.ts?raw";

const lf = (s: string) =>
  s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

const legacy = { classId: "A", className: "Grade 1A" };
const multi = {
  classId: "A",
  className: "Grade 1A",
  classIds: ["A", "B"],
  classNames: ["Grade 1A", "Grade 1B"],
};

describe("the classes of a lesson note", () => {
  it("reads one class from a note that has only classId", () => {
    expect(noteClassIds(legacy)).toEqual(["A"]);
    expect(noteClassNames(legacy)).toEqual(["Grade 1A"]);
    expect(classLabel(legacy)).toBe("Grade 1A");
  });

  it("reads every class from a note that has classIds", () => {
    expect(noteClassIds(multi)).toEqual(["A", "B"]);
    expect(classLabel(multi)).toBe("Grade 1A, Grade 1B");
  });

  it("reads no class from a note with none, and ignores blanks and repeats", () => {
    expect(noteClassIds({})).toEqual([]);
    expect(classLabel({})).toBe("");
    expect(noteClassIds({ classIds: ["A", "", "A"] })).toEqual(["A"]);
  });
});

describe("who can see a note", () => {
  const home = { classId: "A", classIds: ["A"] };
  const other = { classId: "Z", classIds: ["Z"] };

  it("is a student in any of the note classes", () => {
    expect(isNoteVisibleTo(multi, home)).toBe(true);
    expect(isNoteVisibleTo(multi, { classId: "B", classIds: ["B"] })).toBe(
      true,
    );
    expect(isNoteVisibleTo(multi, other)).toBe(false);
    expect(isNoteVisibleTo(legacy, home)).toBe(true);
    expect(isNoteVisibleTo(legacy, other)).toBe(false);
  });

  it("is nobody when the note has no class, or the member has none", () => {
    expect(isNoteVisibleTo({}, home)).toBe(false);
    expect(isNoteVisibleTo(multi, {})).toBe(false);
    expect(isNoteVisibleTo(multi, null)).toBe(false);
  });

  it("counts an additional class, and the subjects the student takes there", () => {
    const extra = {
      classId: "Z",
      classIds: ["Z", "B"],
      classSubjects: { B: ["math"] },
    };
    expect(isNoteVisibleTo(multi, extra)).toBe(true);
    expect(isNoteVisibleTo({ ...multi, subjectId: "math" }, extra)).toBe(true);
    // In class B they take only math, and the note is for English.
    expect(isNoteVisibleTo({ ...multi, subjectId: "english" }, extra)).toBe(
      false,
    );
  });

  it("shows a subject note when the student takes it in any one of the note classes", () => {
    const both = {
      classId: "A",
      classIds: ["A", "B"],
      classSubjects: { B: ["math"] },
    };
    // Home class A gives every subject.
    expect(isNoteVisibleTo({ ...multi, subjectId: "english" }, both)).toBe(
      true,
    );
  });
});

describe("the classes picked in the form", () => {
  it("stores every class, with the first as classId", () => {
    expect(
      classFieldsFor([
        { id: "B", name: "Grade 1B" },
        { id: "A", name: "Grade 1A" },
      ]),
    ).toEqual({
      classId: "B",
      className: "Grade 1B",
      classIds: ["B", "A"],
      classNames: ["Grade 1B", "Grade 1A"],
    });
  });

  it("stores nothing for no class and drops repeats", () => {
    expect(classFieldsFor([])).toBeNull();
    expect(
      classFieldsFor([
        { id: "A", name: "A" },
        { id: "A", name: "A" },
      ])?.classIds,
    ).toEqual(["A"]);
  });

  it("allows 20 classes, the same cap as firestore.rules", () => {
    expect(MAX_LESSON_NOTE_CLASSES).toBe(20);
  });
});

describe("asking Firestore for the notes of some classes", () => {
  it("splits ids into groups of at most 10, without repeats", () => {
    const ids = Array.from({ length: 23 }, (_, i) => `c${i}`);
    expect(idGroups(ids).map((g) => g.length)).toEqual([10, 10, 3]);
    expect(idGroups(["a", "a", "b"])).toEqual([["a", "b"]]);
    expect(idGroups([])).toEqual([]);
  });

  it("is what the hook uses for students and parents, with both the classId and the classIds filter", () => {
    const hook = flat(lf(hookRaw));
    expect(hook).toContain(
      flat("query(col, where('classId', 'in', group), ...newest)"),
    );
    expect(hook).toContain(
      flat(
        "query(col, where('classIds', 'array-contains-any', group), ...newest)",
      ),
    );
    expect(hook).toContain(
      flat(
        "unsub = subscribeMerged(classQueries(col, classIds), visible, fail);",
      ),
    );
    expect(hook).toContain(flat("unsub = subscribeMerged("));
    expect(hook).toContain(flat("classQueries(col, ids)"));
    expect(hook).toContain(flat("children.some((c) => isNoteVisibleTo(n, c))"));
  });
});
