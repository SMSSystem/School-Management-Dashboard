export type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';

export interface AttendanceTotals {
  P: number; A: number; L: number; S: number; E: number;
  filledSessions: number;
  totalExpectedSessions: number;
  attendanceRate: number;       // (P + L) / totalExpectedSessions × 100
  statePercentages: Record<AttendanceState, number>;
}

export function computeAttendanceTotals(
  records: { state: AttendanceState }[],
  totalExpectedSessions: number,
): AttendanceTotals {
  const counts = { P: 0, A: 0, L: 0, S: 0, E: 0 };
  for (const r of records) counts[r.state]++;

  const safe = totalExpectedSessions > 0 ? totalExpectedSessions : 1;
  const attendanceRate = ((counts.P + counts.L) / safe) * 100;

  const statePercentages = Object.fromEntries(
    (Object.keys(counts) as AttendanceState[]).map((k) => [k, (counts[k] / safe) * 100]),
  ) as Record<AttendanceState, number>;

  return {
    ...counts,
    filledSessions: records.length,
    totalExpectedSessions,
    attendanceRate,
    statePercentages,
  };
}
