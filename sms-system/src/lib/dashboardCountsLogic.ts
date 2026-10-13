// Pure parts of the dashboard head-counts (no Firebase import, so they are cheap to
// import from tests and from code that only needs the query-key root). The
// aggregation queries themselves are in dashboardCounts.ts.

export type DashboardCountKind = 'student' | 'teacher' | 'parent' | 'class';

/** Query-key root; allow-listed for persistence (a count is not personal data). */
export const DASHBOARD_COUNTS_ROOT = 'dashboardCounts';

export function dashboardCountsKey(
  institutionId: string,
  kind: DashboardCountKind | 'studentGender' | 'awaitingSignIn' | 'pendingRegistrations',
) {
  return [DASHBOARD_COUNTS_ROOT, institutionId, kind] as const;
}

/** People who still have the default password they were given (mustChangePassword), by group. */
export type AwaitingSignInCounts = { students: number; teachers: number; spectators: number };

export type StudentGenderCounts = { total: number; male: number; female: number };

/** Never negative, even if the three counts were read a moment apart. */
export function genderBreakdown(c: StudentGenderCounts): { male: number; female: number; unknown: number } {
  const male = Math.max(0, c.male);
  const female = Math.max(0, c.female);
  return { male, female, unknown: Math.max(0, c.total - male - female) };
}
