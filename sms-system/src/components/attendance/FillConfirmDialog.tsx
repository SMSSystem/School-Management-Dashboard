import {
  ATTENDANCE_STATE_LABELS,
  type AttendanceState,
} from "@/lib/attendanceStates";
import type { FillMode } from "@/lib/attendanceMissing";

// Confirms a bulk fill before it touches the draft. "Fill N" marks only the students with no state yet; when some
// are already marked (a column filled before, or marked by hand), "Overwrite all" replaces every mark in the
// column instead. A column that is already full offers only Overwrite, so Fill never does nothing in silence.
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
  } | null;
  onCancel: () => void;
  onConfirm: (mode: FillMode) => void;
}) => {
  if (!pending) return null;
  const { description, state, emptyCount, markedCount } = pending;
  const label = ATTENDANCE_STATE_LABELS[state];
  const total = emptyCount + markedCount;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Confirm Fill
        </h3>
        <p
          className={`text-sm text-gray-600 dark:text-gray-300 ${markedCount > 0 ? "mb-2" : "mb-4"}`}
        >
          {emptyCount > 0 ? (
            <>
              Mark {emptyCount} empty student{emptyCount === 1 ? "" : "s"} on{" "}
              {description} as &quot;{label}&quot;?
              {markedCount > 0
                ? ` ${markedCount} already marked won't be changed, unless you overwrite all.`
                : ""}
            </>
          ) : (
            <>
              Every student on {description} is already marked. Mark all {total}{" "}
              as &quot;{label}&quot; instead?
            </>
          )}
        </p>
        {markedCount > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Overwriting replaces every student&apos;s mark in this column,
            including any Excused reasons.
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
              Overwrite all {total}
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
