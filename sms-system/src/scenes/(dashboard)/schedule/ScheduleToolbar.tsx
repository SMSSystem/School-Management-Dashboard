import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Named, ScheduleChoices } from "@/lib/schedule/scheduleChoices";
import type { ScheduleOf } from "@/lib/schedule/weekSchedule";
import type { ScheduleView } from "@/lib/schedule/scheduleUrl";
import { SCHEDULE_TEXT } from "./scheduleLabels";

type Props = {
  rangeLabel: string;
  atStart: boolean;
  atEnd: boolean;
  /** Shown beside a disabled arrow at the edge of what can be shown (D14). */
  edgeNote: string | null;
  onPrev: () => void;
  onNext: () => void;
  /** Disabled when already on the opening week. */
  onToday: (() => void) | null;
  view: ScheduleView;
  /** False on phones: the day view only. */
  canPickView: boolean;
  onView: (view: ScheduleView) => void;
  choices: ScheduleChoices;
  of: ScheduleOf | null;
  onChoose: (of: ScheduleOf) => void;
};

const SELECT_CLS =
  "min-h-11 md:min-h-9 w-full sm:w-auto rounded-md p-2 text-base sm:text-sm ring-[1.5px] ring-gray-300 dark:bg-gray-700 dark:text-white dark:ring-gray-600";
const ICON_BTN =
  "inline-flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700";

// The Schedule page's controls: whose week (for those who may choose), the week arrows and Today, the range label,
// and Week | Day.
export default function ScheduleToolbar(props: Props) {
  const { choices, of } = props;
  const by = of?.by === "teacher" ? "teacher" : "class";
  const list: Named[] = by === "teacher" ? choices.teachers : choices.classes;

  function chooseBy(next: "class" | "teacher") {
    const first = (next === "teacher" ? choices.teachers : choices.classes)[0];
    if (first) props.onChoose({ by: next, id: first.id });
  }

  return (
    <div className="flex flex-col gap-3">
      {choices.canChoose && (
        <div
          id="tour-schedule-choose"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {SCHEDULE_TEXT.show}
          </span>
          <select
            aria-label="Show a class or a teacher"
            className={SELECT_CLS}
            value={by}
            onChange={(e) => chooseBy(e.target.value as "class" | "teacher")}
          >
            <option value="class" disabled={choices.classes.length === 0}>
              {SCHEDULE_TEXT.aClass}
            </option>
            <option value="teacher" disabled={choices.teachers.length === 0}>
              {SCHEDULE_TEXT.aTeacher}
            </option>
          </select>
          <select
            aria-label={by === "teacher" ? "Teacher" : "Class"}
            className={SELECT_CLS}
            value={of?.id ?? ""}
            onChange={(e) => props.onChoose({ by, id: e.target.value })}
          >
            {list.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div
        id="tour-schedule-week-nav"
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          className={ICON_BTN}
          aria-label={SCHEDULE_TEXT.previousWeek}
          disabled={props.atStart}
          onClick={props.onPrev}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={ICON_BTN}
          aria-label={SCHEDULE_TEXT.nextWeek}
          disabled={props.atEnd}
          onClick={props.onNext}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="min-h-11 md:min-h-9 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          disabled={!props.onToday}
          onClick={() => props.onToday?.()}
        >
          {SCHEDULE_TEXT.today}
        </button>
        <span
          className="text-sm font-semibold text-gray-800 dark:text-gray-100"
          aria-live="polite"
        >
          {props.rangeLabel}
        </span>
        {props.canPickView && (
          <div
            role="group"
            aria-label="View"
            className="ml-auto inline-flex rounded-md border border-gray-300 p-0.5 dark:border-gray-600"
          >
            {(["week", "day"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={props.view === v}
                onClick={() => props.onView(v)}
                className={`min-h-9 rounded px-3 text-sm font-medium ${
                  props.view === v
                    ? "bg-sky-700 text-white"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                {v === "week" ? SCHEDULE_TEXT.week : SCHEDULE_TEXT.day}
              </button>
            ))}
          </div>
        )}
      </div>
      {props.edgeNote && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {props.edgeNote}
        </p>
      )}
    </div>
  );
}
