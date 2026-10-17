import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getDocs, query, where } from 'firebase/firestore';
import type { NonSchoolDayDocument, TimetableSlotDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { institutionCollection } from '@/lib/paths';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import type { DateRange, SlotLite } from '@/lib/nextClass';
import { activeTerms } from '@/lib/scheduleDay';
import { classIdsOf, takesSubject, type ClassMembership } from '@/lib/studentClasses';

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

// A class's timetable, or a student's: for the currently active term(s) or time block(s), plus
// the date ranges needed to turn weekly-recurring slots into real dates. Reads
// the class's `timetable_slots` ONCE (cached by React Query, no live listener) —
// the same `classId ==` + `termId in` query shape BigCalendar uses. Shared by the
// next-class card and the dashboard calendar's class-day marks, which use the
// SAME query key, so a student's dashboard still costs one slot read.
//
// `source` is one class id, or a student's classes (lib/studentClasses.ts): one read per class, merged, with the
// slots of an additional class limited to the subjects the student takes there. A student object must keep its
// identity between renders (pass the one from useAuth()/the linked children, or memoise it).
export function useClassTimetable(source: string | ClassMembership | null | undefined): ClassTimetable {
  const { institutionId } = useAuth();
  const membership = source && typeof source === 'object' ? source : null;
  const classIds = useMemo(
    () => (typeof source === 'string' ? [source] : source ? classIdsOf(source) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeof source === 'string' ? source : source ? classIdsOf(source).join(',') : ''],
  );
  const { activeTerm, activeTimeBlocks, nonSchoolDays, nonSchoolDaysByTermId, loading: calLoading } =
    useInstitutionAcademicCalendar();

  const terms = useMemo(
    () => activeTerms(activeTimeBlocks, activeTerm),
    [activeTerm, activeTimeBlocks],
  );
  const termIds = useMemo(() => terms.map((t) => t.id), [terms]);

  const slotsQueries = useQueries({
    queries: classIds.map((classId) => ({
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
            classId,
            subjectId: s.subjectId,
            teacherName: s.teacherName,
            room: s.room,
            days: s.days,
            startTime: s.startTime,
            duration: s.duration,
          };
        });
      },
      enabled: DATA_MODE === 'live' && !!institutionId && institutionId !== '*' && termIds.length > 0,
      staleTime: 5 * 60_000,
    })),
  });

  const loaded = classIds.length > 0 && slotsQueries.every((q) => q.data !== undefined);
  // A string that changes when any class's slots do (the list of queries can change length).
  const updated = slotsQueries.map((q) => q.dataUpdatedAt).join(',');
  const slots = useMemo(() => {
    if (!loaded) return undefined;
    const all = slotsQueries.flatMap((q) => q.data ?? []);
    // An additional class gives only the subjects the student takes there; slots cached before the
    // subject was stored have none and are kept.
    return membership
      ? all.filter((s) => !s.classId || !s.subjectId || takesSubject(membership, s.classId, s.subjectId))
      : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, membership, updated]);

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
    slots,
    termRanges,
    nonSchoolRanges,
    loading: calLoading || slotsQueries.some((q) => q.isLoading && q.fetchStatus !== 'idle'),
    error: slotsQueries.some((q) => q.isError),
  };
}
