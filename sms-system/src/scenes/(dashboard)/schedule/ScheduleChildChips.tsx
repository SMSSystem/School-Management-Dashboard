import type { LinkedChild } from "@/hooks/useLinkedChildren";
import { SCHEDULE_TEXT } from "./scheduleLabels";

type Props = {
  linked: LinkedChild[];
  selected: string;
  onSelect: (uid: string) => void;
};

// "Showing:" with one chip per child, for a parent with more than one child (spec §4).
export default function ScheduleChildChips({
  linked,
  selected,
  onSelect,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {SCHEDULE_TEXT.showing}
      </span>
      <div
        role="group"
        aria-label={SCHEDULE_TEXT.childGroup}
        className="flex flex-wrap gap-2"
      >
        {linked.map((c) => {
          const active = c.uid === selected;
          return (
            <button
              key={c.uid}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(c.uid)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                active
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
