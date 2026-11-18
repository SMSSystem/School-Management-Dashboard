import { PaintBucket } from "lucide-react";
import {
  ATTENDANCE_STATE_LABELS,
  type AttendanceState,
} from "@/lib/attendanceStates";
import { FILLABLE_STATES } from "@/lib/attendanceMissing";
import { STATE_CLASS } from "./AttendanceStateButton";

// The "Fill" control in a register column header: pick a state, then the confirm
// dialog offers to fill the students with no state yet, or to overwrite the whole
// column (FillConfirmDialog). It used to be a bare 10px icon, which nobody found;
// it is now a labelled button. Controlled by the page so only one column's picker
// is open at a time.
const FillColumnButton = ({
  open,
  onToggle,
  onPick,
  onClose,
  description,
}: {
  open: boolean;
  onToggle: () => void;
  onPick: (state: AttendanceState) => void;
  onClose: () => void;
  // What the button fills, for its tooltip and screen-reader name,
  // e.g. "AM cells for Oct 02, 2026".
  description: string;
}) => (
  <div className="relative inline-block">
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400"
      title={`Fill ${description}`}
      aria-label={`Fill ${description}`}
      aria-expanded={open}
    >
      <PaintBucket className="w-3 h-3" aria-hidden="true" />
      Fill
    </button>
    {open && (
      <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-md p-2 w-36 text-left">
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1.5 text-center">
          Fill as…
        </p>
        <div className="flex flex-col gap-1">
          {FILLABLE_STATES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className={`text-xs font-medium rounded px-2 py-1 text-left ${STATE_CLASS[s]}`}
            >
              {s} — {ATTENDANCE_STATE_LABELS[s]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-1.5 w-full text-[10px] text-center text-gray-400 hover:underline"
        >
          Cancel
        </button>
      </div>
    )}
  </div>
);

export default FillColumnButton;
