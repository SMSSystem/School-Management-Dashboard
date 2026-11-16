import { describe, expect, it } from "vitest";
import {
  buildExamPayload,
  durationHint,
  examBudgetFor,
  examDefaultValues,
  examEditId,
  examFormMode,
  newOnlineDefaults,
  resolveExamTeacher,
} from "../examFormLogic";
import { EXAM_LIMITS } from "@/types/exams";

// The exam form's own rules, moved out of components/forms/ExamForm.tsx unchanged so they can be tested directly.

const plain = {
  ...newOnlineDefaults(),
  title: "Mid-term",
  termId: "t1",
  subjectId: "s1",
  classId: "c1",
  date: "2026-12-01",
};
const teacher = { teacherId: "u1", teacherName: "Ms A", departmentId: "d1" };

describe("examFormMode", () => {
  it("is an edit of the saved exam", () => {
    const mode = examFormMode("update", {
      id: "e1",
      online: true,
      opensAt: "x",
    });
    expect(mode.saved).toMatchObject({ id: "e1" });
    expect(mode.duplicateOf).toBeUndefined();
    expect(mode.alreadyOnline).toBe(true);
  });

  it("is a duplicate when a create is filled in from another exam", () => {
    const mode = examFormMode("create", { duplicateOf: "e0", title: "Copy" });
    expect(mode.saved).toBeUndefined();
    expect(mode.duplicateOf).toBe("e0");
    expect(mode.prefill).toMatchObject({ title: "Copy" });
    expect(mode.hasWindow).toBe(false);
  });

  it("is a plain create otherwise, starting from the new defaults", () => {
    const mode = examFormMode("create", undefined);
    expect(mode.prefill).toBeUndefined();
    expect(mode.onlineDefaults).toEqual(newOnlineDefaults());
  });
});

describe("buildExamPayload", () => {
  it("writes the names, the teacher and only the optional fields that are set", () => {
    const payload = buildExamPayload({
      institutionId: "i1",
      formData: { ...plain, startTime: "09:00", duration: "60", room: "" },
      termName: "Term 1",
      subjectName: "English",
      className: "7A",
      teacher,
      saved: undefined,
    });
    expect(payload).toMatchObject({
      institutionId: "i1",
      termName: "Term 1",
      subjectName: "English",
      className: "7A",
      teacherId: "u1",
      departmentId: "d1",
      startTime: "09:00",
      duration: 60,
    });
    expect(payload).not.toHaveProperty("room");
    expect(payload).not.toHaveProperty("status");
  });

  it("leaves out a department and a duration that aren't set, and fills missing names with empty text", () => {
    const payload = buildExamPayload({
      institutionId: "i1",
      formData: { ...plain, duration: "" },
      termName: undefined,
      subjectName: undefined,
      className: undefined,
      teacher: { ...teacher, departmentId: undefined },
      saved: undefined,
    });
    expect(payload).not.toHaveProperty("departmentId");
    expect(payload).not.toHaveProperty("duration");
    expect(payload).toMatchObject({
      termName: "",
      subjectName: "",
      className: "",
    });
  });
});

describe("resolveExamTeacher", () => {
  const base = {
    lockedTeacherId: "me",
    lockedTeacherName: "Me",
    formTeacherId: "u2",
    teacherOptions: [{ id: "u2", name: "Mr B" }],
    userUid: "me",
    myDepartmentId: "mine",
    departmentByTeacherId: { u2: "d2" },
    type: "create" as const,
    data: undefined,
  };

  it("is the signed-in teacher, with their own department, for a teacher", () => {
    expect(resolveExamTeacher({ ...base, isTeacherRole: true })).toEqual({
      teacherId: "me",
      teacherName: "Me",
      departmentId: "mine",
    });
  });

  it("is the chosen teacher, with theirs, for an admin", () => {
    expect(resolveExamTeacher({ ...base, isTeacherRole: false })).toEqual({
      teacherId: "u2",
      teacherName: "Mr B",
      departmentId: "d2",
    });
  });

  it("falls back to the saved department on an edit", () => {
    expect(
      resolveExamTeacher({
        ...base,
        isTeacherRole: false,
        departmentByTeacherId: {},
        type: "update",
        data: { departmentId: "old" },
      }),
    ).toMatchObject({ departmentId: "old" });
  });
});

describe("the small helpers", () => {
  it("starts from the exam's own values", () => {
    expect(
      examDefaultValues({ termId: "t1", room: "R2" }, newOnlineDefaults()),
    ).toMatchObject({ termId: "t1", room: "R2", classId: "" });
  });

  it("leaves the edited exam out of the clash check", () => {
    expect(examEditId("update", { id: "e1" })).toBe("e1");
    expect(examEditId("create", { id: "e1" })).toBe("");
  });

  it("asks for a duration only for an online exam", () => {
    expect(durationHint(true)).toBe(
      `Required: ${EXAM_LIMITS.minDurationMinutes} to ${EXAM_LIMITS.maxDurationMinutes} minutes.`,
    );
    expect(durationHint(false)).toBe("Optional.");
  });

  it("counts at least one student, and the exam's pictures when it has them", () => {
    const budget = examBudgetFor({
      students: null,
      duration: "60",
      checkpoint: "",
      releaseMode: "",
      prefill: { imagePacks: 2 },
    });
    expect(budget).toBeTruthy();
  });
});
