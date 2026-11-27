import type { ReactNode } from "react";
import {
  dayItems,
  type CalendarMode,
  type WeekCell,
  type WeekDay,
  type WeekRow,
  type WeekSchedule,
} from "@/lib/schedule/weekSchedule";
import type { CardSlot } from "./LessonCard";
import {
  SCHEDULE_TEXT,
  blockOffNote,
  dayOffLabel,
  longDate,
  timeLabel,
  weekdayName,
} from "./scheduleLabels";

type Props = {
  week: WeekSchedule<CardSlot>;
  day: WeekDay;
  mode: CalendarMode;
  renderCard: (cell: WeekCell<CardSlot>, row: WeekRow) => ReactNode;
};

// The day view: one date's lessons as an agenda, time on the left and the lesson cards on the right.
export default function ScheduleDayList({
  week,
  day,
  mode,
  renderCard,
}: Props) {
  const heading = (
    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
      {longDate(day.date)}
      {day.today && " "}
      {day.today && (
        <span className="ml-2 text-xs font-medium text-sky-700 dark:text-sky-400">
          {SCHEDULE_TEXT.today}
        </span>
      )}
    </h3>
  );

  if (day.off) {
    return (
      <section className="flex flex-col gap-3">
        {heading}
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
          No school on {longDate(day.date)}: {dayOffLabel(day.off, mode)}.
        </p>
      </section>
    );
  }

  const items = dayItems(week, day.date);
  return (
    <section className="flex flex-col gap-3">
      {heading}
      {day.notes.map((n) => (
        <p
          key={n.termName}
          className="text-xs text-amber-700 dark:text-amber-300"
        >
          {blockOffNote(n.termName, n.reason)}
        </p>
      ))}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
          No classes on {weekdayName(day.date)}.
        </p>
      ) : (
        <ul
          className="flex flex-col gap-3"
          aria-label={`${weekdayName(day.date)} classes`}
        >
          {items.map((item) =>
            item.kind === "gap" ? (
              <li
                key={`gap-${item.start}`}
                className="flex gap-3 text-xs italic text-gray-500 dark:text-gray-400"
              >
                <span className="w-20 shrink-0 text-right">
                  {timeLabel(item.start)}
                </span>
                <span className="flex-1 border-t border-dashed border-gray-200 pt-1 dark:border-gray-700">
                  {SCHEDULE_TEXT.freeTime} until {timeLabel(item.end)}
                </span>
              </li>
            ) : (
              <li key={item.row.start} className="flex gap-3">
                <div className="w-20 shrink-0 pt-2 text-right">
                  <div className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">
                    {timeLabel(item.row.start)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {timeLabel(item.row.end)}
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {item.cells.map((cell) => renderCard(cell, item.row))}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
