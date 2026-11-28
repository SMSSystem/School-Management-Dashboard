import type { ReactNode } from "react";
import type {
  CalendarMode,
  WeekCell,
  WeekRow,
  WeekSchedule,
} from "@/lib/schedule/weekSchedule";
import type { CardSlot } from "./LessonCard";
import {
  SCHEDULE_TEXT,
  blockOffNote,
  dayOffLabel,
  timeLabel,
} from "./scheduleLabels";

type Props = {
  week: WeekSchedule<CardSlot>;
  mode: CalendarMode;
  /** "Grade 5A, week of 23–27 Nov 2026", for screen readers. */
  caption: string;
  renderCard: (cell: WeekCell<CardSlot>, row: WeekRow) => ReactNode;
  /** An id for the header row (the page tour's timetable step points at it). */
  headId?: string;
};

// The week view: a table with dated day columns and one row per start time (D4). The header row and the time column
// stay put while the grid scrolls sideways inside its own box, never the page.
export default function ScheduleWeekGrid({
  week,
  mode,
  caption,
  renderCard,
  headId,
}: Props) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700 focus-visible:outline-2 focus-visible:outline-sky-500"
    >
      <table className="w-full min-w-2xl border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead id={headId}>
          <tr>
            <th
              scope="col"
              className="sticky left-0 top-0 z-20 w-28 bg-gray-50 px-2 py-2 text-left text-xs font-semibold text-gray-500 dark:bg-gray-900 dark:text-gray-400"
            >
              Time
            </th>
            {week.days.map((d) => (
              <th
                key={d.date}
                scope="col"
                aria-current={d.today ? "date" : undefined}
                className={`sticky top-0 z-10 px-2 py-2 text-left align-top text-xs font-semibold ${
                  d.today
                    ? "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"
                    : d.off
                      ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                      : "bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-200"
                }`}
              >
                <span className="block">
                  {d.weekday} {d.label}
                  {d.today && <span className="sr-only"> (today)</span>}
                </span>
                {d.off && (
                  <span className="mt-0.5 block font-normal italic">
                    {dayOffLabel(d.off, mode)}
                  </span>
                )}
                {d.notes.map((n) => (
                  <span
                    key={n.termName}
                    className="mt-0.5 block font-normal text-amber-700 dark:text-amber-300"
                  >
                    {blockOffNote(n.termName, n.reason)}
                  </span>
                ))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.rows.map((row) =>
            row.kind === "gap" ? (
              <tr key={`gap-${row.start}`}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-[11px] font-normal text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                >
                  {timeLabel(row.start)} – {timeLabel(row.end)}
                </th>
                <td
                  colSpan={week.days.length}
                  className="border-t border-dashed border-gray-200 px-2 py-1 text-[11px] italic text-gray-500 dark:border-gray-700 dark:text-gray-400"
                >
                  {SCHEDULE_TEXT.freeTime}
                </td>
              </tr>
            ) : (
              <tr key={row.start}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-t border-gray-200 bg-white px-2 py-2 text-left align-top text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {timeLabel(row.start)}
                  <span className="block font-normal text-gray-500 dark:text-gray-400">
                    {timeLabel(row.end)}
                  </span>
                </th>
                {week.days.map((d) => (
                  <td
                    key={d.date}
                    className={`border-t border-gray-200 px-1.5 py-1.5 align-top dark:border-gray-700 ${
                      d.off
                        ? "bg-gray-100 dark:bg-gray-900/60"
                        : d.today
                          ? "bg-sky-50/60 dark:bg-sky-900/10"
                          : ""
                    }`}
                  >
                    <div className="flex flex-col gap-1.5">
                      {week
                        .at(d.date, row.start)
                        .map((cell) => renderCard(cell, row))}
                    </div>
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
