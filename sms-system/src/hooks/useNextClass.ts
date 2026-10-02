import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useClassTimetable } from '@/hooks/useClassTimetable';
import { upcomingClasses, type UpcomingClass } from '@/lib/nextClass';

// The signed-in student's next few classes, for the dashboard card. The class's
// timetable comes from useClassTimetable (one cached read, no live listener);
// occurrences are computed client-side.
export function useNextClass(limit = 4): {
  classes: UpcomingClass[];
  loading: boolean;
  error: boolean;
} {
  const { classId } = useAuth();
  const { slots, termRanges, nonSchoolRanges, loading, error } = useClassTimetable(classId);

  // Re-evaluate "next" as time passes (a class ends, the next one starts).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const classes = useMemo(
    () => (slots ? upcomingClasses(slots, termRanges, nonSchoolRanges, now, limit) : []),
    [slots, termRanges, nonSchoolRanges, now, limit],
  );

  return { classes, loading, error };
}
