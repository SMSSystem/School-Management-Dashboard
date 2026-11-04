import { queryClient } from "./queryClient";
import { DASHBOARD_COUNTS_ROOT } from "./dashboardCountsLogic";
import { CLASS_POPULATION_ROOT } from "./classPopulation";

/**
 * Refresh every head-count derived from the people in an institution: the
 * dashboard cards and gender chart, and the Classes "Population" column. Call
 * after a user is created, changed, moved between classes, imported or deleted.
 * With no institution id it invalidates every cached institution (a prefix
 * match on the root), which is what callers that only know the signed-in
 * admin's context want.
 */
export function invalidateUserCounts(institutionId?: string | null): void {
  const scope = institutionId ? [institutionId] : [];
  queryClient.invalidateQueries({
    queryKey: [DASHBOARD_COUNTS_ROOT, ...scope],
  });
  queryClient.invalidateQueries({
    queryKey: [CLASS_POPULATION_ROOT, ...scope],
  });
}

/**
 * Refresh the lists of people after new accounts are created, so the person who
 * created them sees them at once: the Students, Teachers and Parents lists (and
 * everything else on the shared users query), and a class's enrolled students.
 * A list not on screen is only marked out of date, so creating several accounts
 * costs one read of the list, on the next visit. With no institution id it covers
 * every cached institution, as invalidateUserCounts does.
 */
export function invalidateUserLists(institutionId?: string | null): void {
  const scope = institutionId ? [institutionId] : [];
  queryClient.invalidateQueries({ queryKey: ["users", ...scope] });
  queryClient.invalidateQueries({ queryKey: ["classStudents", ...scope] });
}
