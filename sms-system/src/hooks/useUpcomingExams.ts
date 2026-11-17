import { useEffect, useMemo, useState } from "react";
import { useOwnClasses } from "@/hooks/useOwnClasses";
import { useStudentExams } from "@/hooks/useStudentExams";
import { upcomingExams, type UpcomingExam } from "@/lib/upcomingExams";

// The signed-in student's exams in the next week, for the dashboard card. Reads through useStudentExams, so it shares
// the Exams page's cached query: opening Exams after Home costs no extra read.
export function useUpcomingExams(limit = 4): {
  exams: UpcomingExam[];
  loading: boolean;
} {
  const own = useOwnClasses();
  const { exams, loading } = useStudentExams();

  // Re-evaluate as time passes (an exam opens, or its time goes by).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const upcoming = useMemo(
    () => upcomingExams(exams, own, now, { limit }),
    [exams, own, now, limit],
  );
  return { exams: upcoming, loading };
}
