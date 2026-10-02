import { useCallback, useMemo } from 'react';
import { useClassTimetable } from '@/hooks/useClassTimetable';
import { classDatesInRange, isoDate } from '@/lib/nextClass';

// For a calendar's tiles: "does this class have a lesson on this date?". Built
// on the class's cached timetable (useClassTimetable), whose query key is shared:
// on the student dashboard it is the same read as the next-class card's, and on
// the parent dashboard it is the same read the weekly calendar uses (BigCalendar
// in controlled mode), so neither page pays for it twice. Covers the active
// term(s) only: dates outside them simply have no mark.
//
// The set is computed once for the active terms' whole extent (not per visible
// month), so paging the calendar never recomputes anything.
export function useClassDays(classId: string | null | undefined): (date: Date) => boolean {
  const { slots, termRanges, nonSchoolRanges } = useClassTimetable(classId);

  const days = useMemo(() => {
    const ranges = Object.values(termRanges);
    if (!slots || slots.length === 0 || ranges.length === 0) return new Set<string>();
    const starts = ranges.map((r) => r.start).sort();
    const ends = ranges.map((r) => r.end).sort();
    const start = starts[0];
    const end = ends[ends.length - 1];
    return classDatesInRange(slots, termRanges, nonSchoolRanges, start, end);
  }, [slots, termRanges, nonSchoolRanges]);

  return useCallback((date: Date) => days.has(isoDate(date)), [days]);
}
