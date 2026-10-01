import { CalendarClock, DoorOpen, UserRound } from "lucide-react";
import { useNextClass } from "@/hooks/useNextClass";
import { formatClassTime } from "@/lib/nextClass";

// Student dashboard: a single colorful card for the next class (subject, time,
// day/date), with the few classes after it listed underneath. Replaces the full
// weekly calendar, which is hard to use on a phone.
const NextClassCard = () => {
  const { classes, loading, error } = useNextClass(4);
  const [next, ...later] = classes;

  return (
    <section
      aria-label="Next class"
      className="rounded-2xl p-5 text-white shadow-sm bg-linear-to-br from-sky-500 via-indigo-500 to-purple-600 dark:from-sky-700 dark:via-indigo-700 dark:to-purple-800"
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
        <CalendarClock className="w-4 h-4" aria-hidden="true" />
        {next?.inProgress ? "Class in progress" : "Next class"}
      </div>

      {loading ? (
        <div className="mt-4 flex flex-col gap-2 animate-pulse" aria-busy="true">
          <div className="h-7 w-2/3 rounded bg-white/25" />
          <div className="h-4 w-1/2 rounded bg-white/20" />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-white/90">Couldn't load your timetable. Please try again later.</p>
      ) : !next ? (
        <div className="mt-4">
          <p className="text-xl font-semibold">No upcoming classes</p>
          <p className="mt-1 text-sm text-white/80">
            Nothing is scheduled for the next two weeks. Check back later.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-2xl sm:text-3xl font-bold leading-tight wrap-break-word">{next.subjectName}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">{next.dayLabel}</span>
            <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
              {formatClassTime(next.start, next.end)}
            </span>
          </div>
          {(next.room || next.teacherName) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/90">
              {next.teacherName && (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="w-4 h-4" aria-hidden="true" />
                  {next.teacherName}
                </span>
              )}
              {next.room && (
                <span className="inline-flex items-center gap-1.5">
                  <DoorOpen className="w-4 h-4" aria-hidden="true" />
                  Room {next.room}
                </span>
              )}
            </div>
          )}

          {later.length > 0 && (
            <div className="mt-4 border-t border-white/25 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Then</p>
              <ul className="mt-2 flex flex-col gap-2">
                {later.map((c) => (
                  <li
                    key={`${c.slotId}-${c.start.getTime()}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/15 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">{c.subjectName}</span>
                    <span className="shrink-0 text-xs text-white/85">
                      {c.dayLabel} · {c.start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default NextClassCard;
