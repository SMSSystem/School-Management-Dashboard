import { useMemo } from "react";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { useOwnClasses } from "@/hooks/useOwnClasses";
import { useClassTimetable } from "@/hooks/useClassTimetable";
import { upcomingClasses, type UpcomingClass } from "@/lib/nextClass";

// The signed-in student's next few classes, for the dashboard card. The class's
// timetable comes from useClassTimetable (one cached read, no live listener);
// occurrences are computed client-side.
export function useNextClass(limit = 4): {
  classes: UpcomingClass[];
  loading: boolean;
  error: boolean;
} {
  const own = useOwnClasses();
  const { slots, termRanges, nonSchoolRanges, loading, error } =
    useClassTimetable(own);

  // Re-evaluate "next" as time passes (a class ends, the next one starts).
  const now = useMinuteClock();

  const classes = useMemo(
    () =>
      slots
        ? upcomingClasses(slots, termRanges, nonSchoolRanges, now, limit)
        : [],
    [slots, termRanges, nonSchoolRanges, now, limit],
  );

  return { classes, loading, error };
}
