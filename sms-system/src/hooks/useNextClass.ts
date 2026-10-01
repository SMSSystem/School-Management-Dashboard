import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocs, query, where } from 'firebase/firestore';
import type { NonSchoolDayDocument, TimetableSlotDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { institutionCollection } from '@/lib/paths';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { upcomingClasses, type DateRange, type SlotLite, type UpcomingClass } from '@/lib/nextClass';

function nonSchoolRange(n: NonSchoolDayDocument): DateRange | null {
  if (n.type === 'single' && n.date) return { start: n.date, end: n.date };
  if (n.type === 'range' && n.startDate && n.endDate) return { start: n.startDate, end: n.endDate };
  return null;
}

// The signed-in student's next few classes, for the dashboard card. Reads the
// class's timetable slots ONCE (cached by React Query, no live listener) — the
// same `classId ==` + `termId in` query shape BigCalendar uses, covering every
// currently active term/time block — and computes occurrences client-side.
export function useNextClass(limit = 4): {
  classes: UpcomingClass[];
  loading: boolean;
  error: boolean;
} {
  const { institutionId, classId } = useAuth();
  const { activeTerm, activeTimeBlocks, nonSchoolDays, nonSchoolDaysByTermId, loading: calLoading } =
    useInstitutionAcademicCalendar();

  const terms = useMemo(
    () =>
      activeTimeBlocks.length > 0
        ? activeTimeBlocks.map((b) => ({ id: b.term.id, start: b.term.startDate, end: b.term.endDate }))
        : activeTerm
          ? [{ id: activeTerm.id, start: activeTerm.startDate, end: activeTerm.endDate }]
          : [],
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

  // Re-evaluate "next" as time passes (a class ends, the next one starts).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const classes = useMemo(() => {
    if (!slotsQuery.data) return [];
    const termRanges: Record<string, DateRange> = {};
    for (const t of terms) termRanges[t.id] = { start: t.start, end: t.end };
    const ranges: DateRange[] = [
      ...nonSchoolDays,
      ...Object.values(nonSchoolDaysByTermId).flat(),
    ]
      .map(nonSchoolRange)
      .filter((r): r is DateRange => r !== null);
    return upcomingClasses(slotsQuery.data, termRanges, ranges, now, limit);
  }, [slotsQuery.data, terms, nonSchoolDays, nonSchoolDaysByTermId, now, limit]);

  return {
    classes,
    loading: calLoading || (slotsQuery.isLoading && slotsQuery.fetchStatus !== 'idle'),
    error: slotsQuery.isError,
  };
}
