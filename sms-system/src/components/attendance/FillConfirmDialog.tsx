import { ATTENDANCE_STATE_LABELS, type AttendanceState } from "@/lib/attendanceStates";

// Confirms a bulk fill before it touches the draft. Only students with no state
// yet are filled; the wording says so.
const FillConfirmDialog = ({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: { description: string; state: AttendanceState; emptyCount: number } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Confirm Fill</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Mark {pending.emptyCount} empty student{pending.emptyCount === 1 ? "" : "s"} on {pending.description} as
          &quot;{ATTENDANCE_STATE_LABELS[pending.state]}&quot;? Students already marked won&apos;t be changed.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
          >
            Fill {pending.emptyCount}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FillConfirmDialog;
