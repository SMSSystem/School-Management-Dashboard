import { queryClient } from './queryClient';
import { DASHBOARD_COUNTS_ROOT } from './dashboardCountsLogic';
import { CLASS_POPULATION_ROOT } from './classPopulation';

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
  queryClient.invalidateQueries({ queryKey: [DASHBOARD_COUNTS_ROOT, ...scope] });
  queryClient.invalidateQueries({ queryKey: [CLASS_POPULATION_ROOT, ...scope] });
}
