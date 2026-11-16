import { describe, expect, it } from "vitest";
import {
  assignmentDefaultValues,
  assignmentNames,
  updateIdFor,
} from "../assignmentFormLogic";

// The assignment form's starting values, denormalised names and edit id, moved out of AssignmentForm.tsx unchanged.

describe("assignmentDefaultValues", () => {
  it("starts a new assignment as an empty homework draft graded in the gradebook", () => {
    expect(assignmentDefaultValues(undefined)).toEqual({
      title: "",
      otherTypeLabel: "",
      termId: "",
      subjectId: "",
      classId: "",
      teacherId: "",
      dueDate: "",
      description: "",
      gradebookColumnId: "",
      rubricId: "",
      type: "homework",
      status: "draft",
      gradingMode: "gradebook",
    });
  });

  it("keeps the record's own values", () => {
    const values = assignmentDefaultValues({
      title: "Essay",
      type: "essay",
      status: "published",
      gradingMode: "standalone",
      rubricId: "r1",
      termId: "t1",
    });
    expect(values).toMatchObject({
      title: "Essay",
      type: "essay",
      status: "published",
      gradingMode: "standalone",
      rubricId: "r1",
      termId: "t1",
      classId: "",
    });
  });
});

describe("assignmentNames", () => {
  const terms = [{ id: "t1", name: "Term 1" }];
  const classes = [{ id: "c1", name: "7A" }];

  it("looks up the chosen term and class, and takes the subject's name", () => {
    expect(
      assignmentNames({ termId: "t1", classId: "c1" }, terms, classes, {
        name: "English",
      }),
    ).toEqual({
      termName: "Term 1",
      subjectName: "English",
      className: "7A",
    });
  });

  it("leaves a name out when nothing matches", () => {
    expect(
      assignmentNames({ termId: "x", classId: "y" }, terms, classes, undefined),
    ).toEqual({
      termName: undefined,
      subjectName: undefined,
      className: undefined,
    });
  });
});

describe("updateIdFor", () => {
  it("is undefined on create, the id on an edit, and null for an edit with no id", () => {
    expect(updateIdFor("create", { id: "a1" })).toBeUndefined();
    expect(updateIdFor("update", { id: "a1" })).toBe("a1");
    expect(updateIdFor("update", {})).toBeNull();
    expect(updateIdFor("update", undefined)).toBeNull();
  });
});
