import {
  ATTENDANCE_STATE_LABELS,
  type AttendanceState,
} from "@/lib/attendanceStates";
import type { FillMode } from "@/lib/attendanceMissing";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// Confirms a bulk fill before it touches the draft. "Fill N" marks only the students with no state yet; when some
// are marked with another state (a column filled before, or marked by hand), "Overwrite N" changes them too.
// Students who already have the chosen state are never counted or touched. A column with nothing to change says
// so, and offers only Cancel, so Fill never does nothing in silence.
const FillConfirmDialog = ({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: {
    description: string;
    state: AttendanceState;
    emptyCount: number;
    markedCount: number;
    excusedCount: number;
  } | null;
  onCancel: () => void;
  onConfirm: (mode: FillMode) => void;
}) => {
  if (!pending) return null;
  const { description, state, emptyCount, markedCount, excusedCount } = pending;
  const label = ATTENDANCE_STATE_LABELS[state];
  const total = emptyCount + markedCount;
  const message =
    emptyCount > 0
      ? `Mark ${plural(emptyCount, "empty student", "empty students")} on ${description} as "${label}"?` +
        (markedCount > 0
          ? ` ${plural(markedCount, "student", "students")} marked differently will stay as they are, unless you overwrite them.`
          : "")
      : markedCount > 0
        ? `Every student on ${description} is already marked. Change the ${plural(markedCount, "student", "students")} not marked "${label}" to "${label}"?`
        : `Every student on ${description} is already marked "${label}". There is nothing to change.`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Confirm Fill
        </h3>
        <p
          className={`text-sm text-gray-600 dark:text-gray-300 ${excusedCount > 0 ? "mb-2" : "mb-4"}`}
        >
          {message}
        </p>
        {excusedCount > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Overwriting replaces{" "}
            {plural(excusedCount, "Excused mark", "Excused marks")} and{" "}
            {excusedCount === 1 ? "its reason" : "their reasons"}.
          </p>
        )}
        <div className="flex flex-wrap gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          {markedCount > 0 && (
            <button
              type="button"
              onClick={() => onConfirm("all")}
              className={
                emptyCount > 0
                  ? "rounded-md border border-amber-400 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/30"
                  : "rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
              }
            >
              Overwrite {total}
            </button>
          )}
          {emptyCount > 0 && (
            <button
              type="button"
              onClick={() => onConfirm("empty")}
              className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
            >
              Fill {emptyCount}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FillConfirmDialog;
