// Canonical attendance state definitions (DEV_NOTES Item 7.4). Previously
// P/A/L/S/E were independently re-declared as their own type/array/color-map
// in a dozen-plus places with no shared source — this module is the source
// of truth for the ones that actually risked drifting out of sync.

export type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E' | 'B';

// Cycle/legend/filter order — B appended last so existing P→A→L→S→E muscle
// memory for click-cycling is unchanged, B is just one more step past E.
export const ATTENDANCE_STATES: AttendanceState[] = ['P', 'A', 'L', 'S', 'E', 'B'];

export const ATTENDANCE_STATE_LABELS: Record<AttendanceState, string> = {
  P: 'Present',
  A: 'Absent',
  L: 'Late',
  S: 'Sick',
  E: 'Excused',
  B: 'Blank',
};

// Chip-style colors shared by my/index.tsx and child/index.tsx (previously a
// byte-identical STATE_COLORS map independently maintained in both files).
export const ATTENDANCE_CHIP_COLORS: Record<AttendanceState, string> = {
  P: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  A: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  L: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  S: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  E: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  B: 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-400',
};
