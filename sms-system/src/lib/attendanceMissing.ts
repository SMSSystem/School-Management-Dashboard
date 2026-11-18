import { byName } from "./sortByName";
import type { AttendanceState } from "./attendanceStates";

// Which students a register session is still missing a state for. Pure, so the
// wording of the confirm dialogs ("these students will not be counted") and the
// bulk fill agree on exactly the same set, and both are unit-tested.

export type RegisterStudent = { uid: string; name: string };

export type SessionMissing = {
  // Shown above the names, e.g. "AM Oct 02, 2026" or "Oct 02, 2026".
  label: string;
  names: string[];
};

// The students (A-Z by name) for whom `hasRecord` is false.
export function unmarkedStudents(
  students: RegisterStudent[],
  hasRecord: (uid: string) => boolean,
): RegisterStudent[] {
  return students
    .filter((s) => !hasRecord(s.uid))
    .sort(byName((s: RegisterStudent) => s.name));
}

export function unmarkedNames(
  students: RegisterStudent[],
  hasRecord: (uid: string) => boolean,
): string[] {
  return unmarkedStudents(students, hasRecord).map((s) => s.name);
}

// One entry per session that still has unmarked students; sessions that are
// complete are left out. Order follows `sessions`.
export function missingBySession(
  students: RegisterStudent[],
  sessions: { label: string; hasRecord: (uid: string) => boolean }[],
): SessionMissing[] {
  return sessions
    .map((s) => ({
      label: s.label,
      names: unmarkedNames(students, s.hasRecord),
    }))
    .filter((s) => s.names.length > 0);
}

// Bulk fill (the "Fill" button on a register column) offers every state except
// 'E': Excused requires a per-student reason, which an action across N students
// cannot supply, so each Excused cell stays a hand-marked one.
export const FILLABLE_STATES: AttendanceState[] = ["P", "A", "L", "S", "B"];

export function isFillable(state: AttendanceState): boolean {
  return FILLABLE_STATES.includes(state);
}

// What a fill does: 'empty' marks only the students with no state yet (anyone
// already marked, saved or in the draft, keeps their mark); 'all' overwrites the
// whole column, the admin's explicit choice in the confirm dialog.
export type FillMode = "empty" | "all";

// The students a fill would touch, for the chosen mode.
export function studentsToFill<S extends RegisterStudent>(
  students: S[],
  hasRecord: (uid: string) => boolean,
  mode: FillMode = "empty",
): S[] {
  return mode === "all"
    ? [...students]
    : students.filter((s) => !hasRecord(s.uid));
}

// The two counts the confirm dialog shows: how many are empty, how many are already marked.
export function fillCounts(
  students: RegisterStudent[],
  hasRecord: (uid: string) => boolean,
): { emptyCount: number; markedCount: number } {
  const emptyCount = studentsToFill(students, hasRecord).length;
  return { emptyCount, markedCount: students.length - emptyCount };
}
