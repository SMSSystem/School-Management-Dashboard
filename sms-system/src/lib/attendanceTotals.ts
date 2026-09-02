import type { AttendanceState } from './attendanceStates';

export interface AttendanceTotals {
  P: number; A: number; L: number; S: number; E: number; B: number;
  filledSessions: number;
  effectiveExpectedSessions: number;
  attendanceRate: number;       // (P + L) / effectiveExpectedSessions × 100
  statePercentages: Record<AttendanceState, number>;
}

/**
 * The `totalExpectedSessions` parameter must be the total for the *complete*
 * record set being passed in `records` — this function has no way to verify
 * that on its own. It excludes any "B" (Blank, DEV_NOTES Item 7.4) mark found
 * in `records` to produce `effectiveExpectedSessions`, matching the same
 * student-excludes-B semantics as General Attendance's rebuildSummariesForClass.
 * The output field is deliberately named differently from the input
 * parameter so callers can't mistake one for the other.
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
    effectiveExpectedSessions,
    attendanceRate,
    statePercentages,
  };
}

export interface DayRowTotals {
  totalFilled: number;
  presentSessions: number;
  rate: number | null;
}

/**
 * Stats for the General (AM/PM) tab's day-row table — distinct from
 * computeAttendanceTotals above, which works over a flat per-subject-session
 * record list rather than paired am/pm day rows. "B" (Blank, DEV_NOTES
 * Item 7.4) is excluded from the expected-sessions denominator, matching
 * attendanceSummaries' per-student semantics.
 */
export function computeDayRowTotals(
  rows: { am: AttendanceState | null; pm: AttendanceState | null }[],
): DayRowTotals {
  const totalFilled = rows.reduce(
    (acc, r) => acc + (r.am && r.am !== 'B' ? 1 : 0) + (r.pm && r.pm !== 'B' ? 1 : 0),
    0,
  );
  const presentSessions = rows.reduce(
    (acc, r) => acc + (r.am === 'P' ? 1 : 0) + (r.pm === 'P' ? 1 : 0),
    0,
  );
  const rate = totalFilled > 0 ? Math.round((presentSessions / totalFilled) * 100) : null;

  return { totalFilled, presentSessions, rate };
}
