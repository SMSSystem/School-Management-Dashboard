import type { CalendarMode, WeekDay } from "@/lib/schedule/weekSchedule";
import {
  SCHEDULE_TEXT,
  dayMonth,
  dayOffLabel,
  weekdayName,
} from "./scheduleLabels";

type Props = {
  days: WeekDay[];
  selected: string;
  /** Dates with at least one lesson: they get a dot. */
  withClasses: ReadonlySet<string>;
  mode: CalendarMode;
  onSelect: (date: string) => void;
};

// The day chips of the day view. Two separate states (spec §4): the SELECTED chip is filled and has
// aria-pressed="true"; TODAY's chip has "(today)" in its name and a bar under it, whether or not it is selected.
export default function ScheduleDayChips({
  days,
  selected,
  withClasses,
  mode,
  onSelect,
}: Props) {
  return (
    <div
      role="group"
      aria-label={SCHEDULE_TEXT.dayGroup}
      className={`grid gap-1.5 ${days.length === 6 ? "grid-cols-6" : "grid-cols-5"}`}
    >
      {days.map((d) => {
        const active = d.date === selected;
        const has = withClasses.has(d.date);
        const label = [
          `${weekdayName(d.date)} ${dayMonth(d.date)}${d.today ? " (today)" : ""}`,
          has ? "has classes" : undefined,
          d.off ? `no school: ${dayOffLabel(d.off, mode)}` : undefined,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <button
            key={d.date}
            type="button"
            aria-pressed={active}
            aria-label={label}
            onClick={() => onSelect(d.date)}
            className={`relative min-h-14 rounded-xl border text-center transition-colors ${
              active
                ? "border-sky-700 bg-sky-700 text-white shadow-sm"
                : d.off
                  ? "border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500"
                  : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            }`}
          >
            <span className="block text-xs font-semibold">{d.weekday}</span>
            <span className="block text-sm">
              {d.date.slice(8).replace(/^0/, "")}
            </span>
            <span className="mt-0.5 flex justify-center" aria-hidden="true">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  has ? (active ? "bg-white" : "bg-sky-500") : ""
                }`}
              />
            </span>
            {d.today && (
              <span
                className={`absolute inset-x-2 bottom-1 h-0.5 rounded-full ${active ? "bg-white/70" : "bg-sky-400"}`}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
