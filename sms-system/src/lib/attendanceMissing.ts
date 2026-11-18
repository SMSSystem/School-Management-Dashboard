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
// column, the admin's explicit choice in the confirm dialog. Either way a student
// who already has the chosen state is left alone, so a fill never makes a draft
// (and a save) that changes nothing.
export type FillMode = "empty" | "all";

// A student's current state in the column (saved or in the draft), or undefined when unmarked.
export type StateOf = (uid: string) => string | undefined;

// The students a fill would change, for the chosen mode and state.
export function studentsToFill<S extends RegisterStudent>(
  students: S[],
  stateOf: StateOf,
  mode: FillMode,
  target: AttendanceState,
): S[] {
  return students.filter((s) => {
    const current = stateOf(s.uid);
    return mode === "all" ? current !== target : !current;
  });
}

// What the confirm dialog says: how many are empty, how many are marked with
// another state (an overwrite would change them), and how many of those are
// Excused (their reasons would be lost).
export function fillCounts(
  students: RegisterStudent[],
  stateOf: StateOf,
  target: AttendanceState,
): { emptyCount: number; markedCount: number; excusedCount: number } {
  let emptyCount = 0;
  let markedCount = 0;
  let excusedCount = 0;
  for (const s of students) {
    const current = stateOf(s.uid);
    if (!current) emptyCount += 1;
    else if (current !== target) {
      markedCount += 1;
      if (current === "E") excusedCount += 1;
    }
  }
  return { emptyCount, markedCount, excusedCount };
}
