import { byName } from './sortByName';
import type { AttendanceState } from './attendanceStates';

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
  return students.filter((s) => !hasRecord(s.uid)).sort(byName((s: RegisterStudent) => s.name));
}

export function unmarkedNames(students: RegisterStudent[], hasRecord: (uid: string) => boolean): string[] {
  return unmarkedStudents(students, hasRecord).map((s) => s.name);
}

// One entry per session that still has unmarked students; sessions that are
// complete are left out. Order follows `sessions`.
export function missingBySession(
  students: RegisterStudent[],
  sessions: { label: string; hasRecord: (uid: string) => boolean }[],
): SessionMissing[] {
  return sessions
    .map((s) => ({ label: s.label, names: unmarkedNames(students, s.hasRecord) }))
    .filter((s) => s.names.length > 0);
}

// Bulk fill (the "Fill" button on a register column) offers every state except
// 'E': Excused requires a per-student reason, which an action across N students
// cannot supply, so each Excused cell stays a hand-marked one.
export const FILLABLE_STATES: AttendanceState[] = ['P', 'A', 'L', 'S', 'B'];

export function isFillable(state: AttendanceState): boolean {
  return FILLABLE_STATES.includes(state);
}

// The students a fill would touch: only those with no state yet. Anyone already
// marked (saved, or in the draft) is never changed.
export function studentsToFill(
  students: RegisterStudent[],
  hasRecord: (uid: string) => boolean,
): RegisterStudent[] {
  return students.filter((s) => !hasRecord(s.uid));
}
