import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { fetchRoleCount, fetchStudentGenderCounts } from '@/lib/dashboardCounts';
import { dashboardCountsKey, type DashboardCountKind } from '@/lib/dashboardCountsLogic';

// Counts need not be live: five minutes of staleness (and a refetch on mount
// after that, or right after a user is saved/deleted — FormModal and
// deleteUserExecutor invalidate the `dashboardCounts` root) is plenty for a
// head-count card, and keeps a dashboard visit to a handful of reads.
const COUNT_STALE_MS = 5 * 60_000;

function useEnabledInstitution(): string | null {
  const { institutionId } = useAuth();
  return DATA_MODE === 'live' && institutionId && institutionId !== '*' ? institutionId : null;
}

export function useRoleCount(kind: DashboardCountKind) {
  const institutionId = useEnabledInstitution();
  return useQuery({
    queryKey: dashboardCountsKey(institutionId ?? '', kind),
    queryFn: () => fetchRoleCount(institutionId as string, kind),
    enabled: !!institutionId,
    staleTime: COUNT_STALE_MS,
  });
}

export function useStudentGenderCounts() {
  const institutionId = useEnabledInstitution();
  return useQuery({
    queryKey: dashboardCountsKey(institutionId ?? '', 'studentGender'),
    queryFn: () => fetchStudentGenderCounts(institutionId as string),
    enabled: !!institutionId,
    staleTime: COUNT_STALE_MS,
  });
}
