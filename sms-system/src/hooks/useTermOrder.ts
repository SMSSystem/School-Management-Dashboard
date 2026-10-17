import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { SUPER_ADMIN_SENTINEL } from '@/lib/paths';
import { fetchAcademicYears } from '@/hooks/useInstitutionAcademicCalendar';
import { sortTermsForCalendar } from '@/lib/termOrder';

// The function that puts terms in the order this institution's calendar uses (lib/termOrder.ts): by start
// date for a standard calendar, the calendar's concurrent-block order for a custom one. The function keeps its
// identity until the calendar mode or the academic years change, so it can be handed to useQuery's `select`.
//
// Only a custom calendar needs the academic years (their creation time is the order); that read shares the
// calendar hook's cache entry, and a standard calendar does not read them at all.
export function useTermOrder() {
  const { institutionId, institution } = useAuth();
  const calendarMode = institution?.calendarMode;
  const custom = calendarMode === 'custom';

  const years = useQuery({
    queryKey: ['academicYears', institutionId ?? ''],
    queryFn: () => fetchAcademicYears(institutionId as string),
    enabled: custom && DATA_MODE === 'live' && !!institutionId && institutionId !== SUPER_ADMIN_SENTINEL,
  });

  const yearCreatedMs = useMemo(() => {
    const map: Record<string, number> = {};
    for (const y of years.data ?? []) map[y.id] = y.createdAt?.toMillis() ?? 0;
    return map;
  }, [years.data]);

  return useMemo(
    () =>
      <T extends { name: string; startDate: string; endDate: string; academicYearId?: string }>(terms: readonly T[]): T[] =>
        sortTermsForCalendar(terms, calendarMode, yearCreatedMs),
    [calendarMode, yearCreatedMs],
  );
}
