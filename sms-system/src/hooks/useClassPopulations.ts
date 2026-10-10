import { useQueries } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { classPopulationKey } from '@/lib/classPopulation';
import { fetchClassPopulation } from '@/lib/classPopulationQueries';

// Active students per class for the classes shown on the current page. One
// cached query per class (two count() aggregations each), so paging only reads
// the classes now on screen. Not live: refreshed on mount after a minute, and
// right after a student is saved, moved, imported or deleted (those paths
// invalidate the `classPopulation` root).
export function useClassPopulations(classIds: string[]) {
  const { institutionId } = useAuth();
  const enabled = DATA_MODE === 'live' && !!institutionId && institutionId !== '*';

  const results = useQueries({
    queries: classIds.map((classId) => ({
      queryKey: classPopulationKey(institutionId ?? '', classId),
      queryFn: () => fetchClassPopulation(institutionId as string, classId),
      enabled,
      staleTime: 60_000,
    })),
  });

  const populations: Record<string, number | undefined> = {};
  classIds.forEach((classId, i) => {
    populations[classId] = results[i]?.data;
  });
  return {
    populations,
    isError: results.some((r) => r.isError),
  };
}
