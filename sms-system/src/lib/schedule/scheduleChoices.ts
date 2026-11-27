// Whose week each role may see on the Schedule page, and which it opens on (spec §4). Pure.
//
// - Admin and spectator: any class or teacher; the teacher list is the users list (only they may read it).
// - Senior teacher: any class or teacher too, but the users rules let a teacher read only students and their own
//   department's teachers, so the teacher list comes from the teacher ids and names stored on subjects (D13). A
//   teacher who teaches no subject is not on it (accepted; ISSUES_AND_GAPS #87).
// - Regular teacher: only their own week (D2; a dropdown of the classes they teach is in BACKLOG).
// - Student and parent: the student's merged week across their classes (D15).

import type { Role } from "@/lib/firebase";
import { byName, sortByNameNatural } from "@/lib/sortByName";
import type { ScheduleOf } from "./weekSchedule";

export type Named = { id: string; name: string };

export type ScheduleChoices = {
  /** May pick a class or a teacher from the dropdowns. */
  canChoose: boolean;
  /** What the page opens on; null shows the empty state (no institution, no class, no child). */
  initial: ScheduleOf | null;
  /** In natural order ("Grade 2A" before "Grade 10A"). */
  classes: Named[];
  /** By name. */
  teachers: Named[];
};

export type ScheduleChoicesInput = {
  role: Role | null | undefined;
  uid: string | null | undefined;
  displayName?: string | null;
  classes: Named[];
  /** Admin and spectator: the teaching staff from the users list. */
  staff?: Named[];
  /** Senior teacher: the subjects, whose teachers make the list (D13). */
  subjects?: { teacherIds?: string[]; teacherNames?: string[] }[];
  /** Student: themself; parent: the selected child. */
  studentId?: string | null;
};

const NONE: ScheduleChoices = {
  canChoose: false,
  initial: null,
  classes: [],
  teachers: [],
};

/** The teachers named on subjects, once each; a missing name falls back to the id. */
export function teachersFromSubjects(
  subjects: ScheduleChoicesInput["subjects"],
): Named[] {
  const byId = new Map<string, string>();
  for (const s of subjects ?? []) {
    (s.teacherIds ?? []).forEach((id, i) => {
      if (!id) return;
      const name = s.teacherNames?.[i]?.trim();
      if (!byId.has(id) || (name && byId.get(id) === id))
        byId.set(id, name || id);
    });
  }
  return [...byId.entries()].map(([id, name]) => ({ id, name }));
}

const sortTeachers = (list: Named[]): Named[] =>
  [...list].sort(byName((t) => t.name));

/** Admin and spectator: the users list, opening on the first class (or the first teacher when there is no class). */
function adminChoices(
  classes: Named[],
  staff: Named[] | undefined,
): ScheduleChoices {
  const teachers = sortTeachers(staff ?? []);
  const first: ScheduleOf | null = classes[0]
    ? { by: "class", id: classes[0].id }
    : null;
  const initial =
    first ?? (teachers[0] ? { by: "teacher", id: teachers[0].id } : null);
  return { canChoose: true, initial, classes, teachers };
}

/** Senior teacher: teachers from subjects (D13), with themself always on the list, opening on their own week. */
function seniorChoices(
  classes: Named[],
  self: Named,
  subjects: ScheduleChoicesInput["subjects"],
): ScheduleChoices {
  const fromSubjects = teachersFromSubjects(subjects);
  const withSelf = fromSubjects.some((t) => t.id === self.id)
    ? fromSubjects
    : [...fromSubjects, self];
  return {
    canChoose: true,
    initial: { by: "teacher", id: self.id },
    classes,
    teachers: sortTeachers(withSelf),
  };
}

export function scheduleChoices(input: ScheduleChoicesInput): ScheduleChoices {
  const classes = sortByNameNatural(input.classes, (c) => c.name);
  const self: Named | null = input.uid
    ? { id: input.uid, name: input.displayName?.trim() || "You" }
    : null;
  const student: ScheduleOf | null = input.studentId
    ? { by: "student", id: input.studentId }
    : null;

  switch (input.role) {
    case "institution_admin":
    case "spectator":
      return adminChoices(classes, input.staff);
    case "senior_teacher":
      return self ? seniorChoices(classes, self, input.subjects) : NONE;
    case "regular_teacher":
      return self
        ? {
            canChoose: false,
            initial: { by: "teacher", id: self.id },
            classes: [],
            teachers: [self],
          }
        : NONE;
    case "student":
    case "parent":
      return { ...NONE, initial: student };
    default:
      return NONE;
  }
}
