import { ArrowRight, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { useUpcomingExams } from "@/hooks/useUpcomingExams";
import { formatExamClock } from "@/lib/examDateTime";
import { dayLabel } from "@/lib/nextClass";
import type { UpcomingExam } from "@/lib/upcomingExams";

// Student dashboard: an amber card above "Next class" for an exam in the next seven days (or an online exam open now),
// with the few after it listed underneath and a button to the Exams page. Shows nothing while loading or when there
// is no such exam, so a student without exams sees the dashboard as before.

const timeOf = (e: UpcomingExam) =>
  !e.hasTime
    ? null
    : e.online
      ? formatExamClock(e.startMs)
      : new Date(e.startMs).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        });

const headingOf = (e: UpcomingExam, now: Date) =>
  e.openNow
    ? "Exam open now"
    : dayLabel(new Date(e.startMs), now) === "Today"
      ? "Exam today"
      : "Upcoming exam";

const UpcomingExamCard = () => {
  const { exams, loading } = useUpcomingExams(4);
  if (loading || exams.length === 0) return null;
  const [next, ...later] = exams;
  const now = new Date();
  const time = timeOf(next);

  return (
    <section
      aria-label="Upcoming exam"
      className="rounded-2xl p-5 text-white shadow-sm bg-linear-to-br from-amber-500 via-orange-500 to-orange-600 dark:from-amber-600 dark:via-orange-700 dark:to-orange-800"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/85">
        <ClipboardList className="w-4 h-4" aria-hidden="true" />
        {headingOf(next, now)}
      </div>

      <p className="mt-3 text-2xl sm:text-3xl font-bold leading-tight wrap-break-word">
        {next.title}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {next.openNow ? (
          <span className="rounded-full bg-white/25 px-3 py-1 text-sm font-semibold">
            Open now
          </span>
        ) : (
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
            {dayLabel(new Date(next.startMs), now)}
          </span>
        )}
        {time && !next.openNow && (
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
            {time}
          </span>
        )}
        {next.typeLabel && (
          <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
            {next.typeLabel}
          </span>
        )}
      </div>

      {later.length > 0 && (
        <div className="mt-4 border-t border-white/30 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/75">
            Then
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {later.map((e) => {
              const t = timeOf(e);
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white/15 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium">
                    {e.title}
                  </span>
                  <span className="shrink-0 text-xs text-white/90">
                    {e.openNow
                      ? "Open now"
                      : dayLabel(new Date(e.startMs), now)}
                    {t && !e.openNow ? ` · ${t}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Link
        to="/dashboard/list/exams"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-orange-700 shadow-sm hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-orange-500 dark:text-orange-800"
      >
        {next.openNow ? "Take it now" : "Go to Exams"}
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </section>
  );
};

export default UpcomingExamCard;
