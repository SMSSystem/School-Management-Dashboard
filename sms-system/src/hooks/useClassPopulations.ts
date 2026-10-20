import { useQueries } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { classPopulationKey, type GenderCounts } from '@/lib/classPopulation';
import { storedPopulationOf } from '@/lib/classPopulationDelta';
import { fetchClassPopulation } from '@/lib/classPopulationQueries';
import { REFERENCE_STALE_MS } from '@/lib/queryPolicies';

// Active students per class, split by gender, for the classes shown on the current page.
//
// A class that has been recounted (populationBaseline) carries its head-count on its own document, which the page has
// already read, so it costs nothing here and follows every change live. Any other class falls back to six count()
// aggregations, one cached query per class, so paging only reads the classes now on screen. The cached fallback is
// not live: refreshed on mount after ten minutes, and right after a student is saved, moved, imported or deleted
// (those paths invalidate the `classPopulation` root).
export function useClassPopulations(classes: { id: string; population?: unknown; populationBaseline?: unknown }[]) {
  const { institutionId } = useAuth();
  const enabled = DATA_MODE === 'live' && !!institutionId && institutionId !== '*';
  const stored = classes.map((c) => storedPopulationOf(c));

  const results = useQueries({
    queries: classes.map((c, i) => ({
      queryKey: classPopulationKey(institutionId ?? '', c.id),
      queryFn: () => fetchClassPopulation(institutionId as string, c.id),
      enabled: enabled && stored[i] === undefined,
      staleTime: REFERENCE_STALE_MS,
    })),
  });

  const populations: Record<string, GenderCounts | undefined> = {};
  classes.forEach((c, i) => {
    populations[c.id] = stored[i] ?? results[i]?.data;
  });
  return {
    populations,
    isError: results.some((r, i) => stored[i] === undefined && r.isError),
  };
}
