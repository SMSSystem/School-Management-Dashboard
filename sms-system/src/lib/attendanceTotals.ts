import type { AttendanceState } from './attendanceStates';

export interface AttendanceTotals {
  P: number; A: number; L: number; S: number; E: number; B: number;
  filledSessions: number;
  totalExpectedSessions: number;
  attendanceRate: number;       // (P + L) / totalExpectedSessions × 100
  statePercentages: Record<AttendanceState, number>;
}

/**
 * `totalExpectedSessions` is the raw count of sessions this student has any
 * record for; a "B" (Blank, DEV_NOTES Item 7.4) mark is excluded from it here
 * so the returned total/rate match the same student-excludes-B semantics as
 * General Attendance's rebuildSummariesForClass.
 */
export function computeAttendanceTotals(
  records: { state: AttendanceState }[],
  totalExpectedSessions: number,
): AttendanceTotals {
  const counts = { P: 0, A: 0, L: 0, S: 0, E: 0, B: 0 };
  for (const r of records) counts[r.state]++;

  const effectiveExpectedSessions = Math.max(0, totalExpectedSessions - counts.B);
  const safe = effectiveExpectedSessions > 0 ? effectiveExpectedSessions : 1;
  const attendanceRate = ((counts.P + counts.L) / safe) * 100;

  const statePercentages = Object.fromEntries(
    (Object.keys(counts) as AttendanceState[]).map((k) => [k, (counts[k] / safe) * 100]),
  ) as Record<AttendanceState, number>;

  return {
    ...counts,
    filledSessions: records.length,
    totalExpectedSessions: effectiveExpectedSessions,
    attendanceRate,
    statePercentages,
  };
}
