import { describe, expect, it } from "vitest";
import {
  scheduleChoices,
  teachersFromSubjects,
} from "../schedule/scheduleChoices";

const classes = [
  { id: "c10a", name: "Grade 10A" },
  { id: "c2b", name: "Grade 2B" },
  { id: "c2a", name: "Grade 2A" },
];
const staff = [
  { id: "u2", name: "Delroy Brown" },
  { id: "u1", name: "Andrea Campbell" },
];

describe("scheduleChoices", () => {
  it("admin: any class or teacher, opening on the first class in natural order", () => {
    const c = scheduleChoices({
      role: "institution_admin",
      uid: "adm",
      classes,
      staff,
    });
    expect(c.canChoose).toBe(true);
    expect(c.classes.map((x) => x.name)).toEqual([
      "Grade 2A",
      "Grade 2B",
      "Grade 10A",
    ]);
    expect(c.teachers.map((x) => x.name)).toEqual([
      "Andrea Campbell",
      "Delroy Brown",
    ]);
    expect(c.initial).toEqual({ by: "class", id: "c2a" });
  });

  it("spectator: the same view as the admin", () => {
    const c = scheduleChoices({
      role: "spectator",
      uid: "spe",
      classes,
      staff,
    });
    expect(c.canChoose).toBe(true);
    expect(c.initial).toEqual({ by: "class", id: "c2a" });
  });

  it("admin with no classes opens on the first teacher, or nothing", () => {
    expect(
      scheduleChoices({
        role: "institution_admin",
        uid: "a",
        classes: [],
        staff,
      }).initial,
    ).toEqual({
      by: "teacher",
      id: "u1",
    });
    expect(
      scheduleChoices({
        role: "institution_admin",
        uid: "a",
        classes: [],
        staff: [],
      }).initial,
    ).toBeNull();
  });

  it("senior teacher: teachers from subjects (D13), their own week first, and always themself in the list", () => {
    const c = scheduleChoices({
      role: "senior_teacher",
      uid: "me",
      displayName: "Marcia Fraser",
      classes,
      subjects: [
        {
          teacherIds: ["u2", "u3"],
          teacherNames: ["Delroy Brown", "Kerry-Ann Williams"],
        },
        { teacherIds: ["u2"], teacherNames: ["Delroy Brown"] },
      ],
    });
    expect(c.canChoose).toBe(true);
    expect(c.initial).toEqual({ by: "teacher", id: "me" });
    expect(c.teachers.map((t) => t.name)).toEqual([
      "Delroy Brown",
      "Kerry-Ann Williams",
      "Marcia Fraser",
    ]);
  });

  it("regular teacher: only their own week", () => {
    const c = scheduleChoices({
      role: "regular_teacher",
      uid: "me",
      displayName: "Andrea Grant",
      classes,
      staff,
    });
    expect(c).toEqual({
      canChoose: false,
      initial: { by: "teacher", id: "me" },
      classes: [],
      teachers: [{ id: "me", name: "Andrea Grant" }],
    });
  });

  it("student and parent: the student's merged week, no choice", () => {
    expect(
      scheduleChoices({ role: "student", uid: "s1", classes, studentId: "s1" }),
    ).toEqual({
      canChoose: false,
      initial: { by: "student", id: "s1" },
      classes: [],
      teachers: [],
    });
    expect(
      scheduleChoices({ role: "parent", uid: "p1", classes, studentId: "kid" })
        .initial,
    ).toEqual({
      by: "student",
      id: "kid",
    });
    expect(
      scheduleChoices({ role: "parent", uid: "p1", classes, studentId: null })
        .initial,
    ).toBeNull();
  });

  it("super admin, or no role: nothing to show", () => {
    expect(
      scheduleChoices({ role: "super_admin", uid: "x", classes, staff })
        .initial,
    ).toBeNull();
    expect(
      scheduleChoices({ role: null, uid: null, classes, staff }).initial,
    ).toBeNull();
  });
});

describe("teachersFromSubjects", () => {
  it("lists each teacher once, keeping a real name over a missing one", () => {
    expect(
      teachersFromSubjects([
        { teacherIds: ["u1", ""], teacherNames: [] },
        { teacherIds: ["u1"], teacherNames: ["Andrea Campbell"] },
        {},
      ]),
    ).toEqual([{ id: "u1", name: "Andrea Campbell" }]);
  });
});
