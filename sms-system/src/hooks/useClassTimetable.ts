import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocs, query, where } from 'firebase/firestore';
import type { NonSchoolDayDocument, TimetableSlotDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { institutionCollection } from '@/lib/paths';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import type { DateRange, SlotLite } from '@/lib/nextClass';
import { activeTerms } from '@/lib/scheduleDay';

function nonSchoolRange(n: NonSchoolDayDocument): DateRange | null {
  if (n.type === 'single' && n.date) return { start: n.date, end: n.date };
  if (n.type === 'range' && n.startDate && n.endDate) return { start: n.startDate, end: n.endDate };
  return null;
}

export type ClassTimetable = {
  slots: SlotLite[] | undefined;
  termRanges: Record<string, DateRange>;
  nonSchoolRanges: DateRange[];
  loading: boolean;
  error: boolean;
};

// One class's timetable for the currently active term(s) or time block(s), plus
// the date ranges needed to turn weekly-recurring slots into real dates. Reads
// the class's `timetable_slots` ONCE (cached by React Query, no live listener) —
// the same `classId ==` + `termId in` query shape BigCalendar uses. Shared by the
// next-class card and the dashboard calendar's class-day marks, which use the
// SAME query key, so a student's dashboard still costs one slot read.
export function useClassTimetable(classId: string | null | undefined): ClassTimetable {
  const { institutionId } = useAuth();
  const { activeTerm, activeTimeBlocks, nonSchoolDays, nonSchoolDaysByTermId, loading: calLoading } =
    useInstitutionAcademicCalendar();

  const terms = useMemo(
    () => activeTerms(activeTimeBlocks, activeTerm),
    [activeTerm, activeTimeBlocks],
  );
  const termIds = useMemo(() => terms.map((t) => t.id), [terms]);

  const slotsQuery = useQuery({
    queryKey: ['nextClassSlots', institutionId, classId, termIds.join(',')],
    queryFn: async (): Promise<SlotLite[]> => {
      const snap = await getDocs(
        query(
          institutionCollection(institutionId!, 'timetable_slots'),
          where('classId', '==', classId),
          where('termId', 'in', termIds),
        ),
      );
      return snap.docs.map((d) => {
        const s = d.data() as TimetableSlotDocument;
        return {
          id: d.id,
          termId: s.termId,
          termName: s.termName,
          subjectName: s.subjectName,
          teacherName: s.teacherName,
          room: s.room,
          days: s.days,
          startTime: s.startTime,
          duration: s.duration,
        };
      });
    },
    enabled:
      DATA_MODE === 'live' && !!institutionId && institutionId !== '*' && !!classId && termIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const termRanges = useMemo(() => {
    const ranges: Record<string, DateRange> = {};
    for (const t of terms) ranges[t.id] = { start: t.start, end: t.end };
    return ranges;
  }, [terms]);

  const nonSchoolRanges = useMemo(
    () =>
      [...nonSchoolDays, ...Object.values(nonSchoolDaysByTermId).flat()]
        .map(nonSchoolRange)
        .filter((r): r is DateRange => r !== null),
    [nonSchoolDays, nonSchoolDaysByTermId],
  );

  return {
    slots: slotsQuery.data,
    termRanges,
    nonSchoolRanges,
    loading: calLoading || (slotsQuery.isLoading && slotsQuery.fetchStatus !== 'idle'),
    error: slotsQuery.isError,
  };
}
