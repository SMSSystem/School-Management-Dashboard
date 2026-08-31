const REASON_MAX_LENGTH = 60;
const PRESET_REASON = 'Representing the institution (competition/interview/etc.)';

interface Props {
  studentName: string;
  reason: string;
  onReasonChange: (r: string) => void;
  onClose: () => void;
}

export function ExcusedReasonPopover({ studentName, reason, onReasonChange, onClose }: Props) {
  return (
    <div className="absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-md p-3 w-56">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        Reason for excusing{' '}
        <span className="font-medium text-gray-700 dark:text-gray-200">{studentName}</span>{' '}
        <span className="text-gray-400">(optional)</span>
      </p>
      <button
        type="button"
        onClick={() => onReasonChange(PRESET_REASON)}
        className="w-full mb-1.5 text-left text-xs px-1.5 py-1 rounded ring-1 ring-gray-200 dark:ring-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        Preset: Education
      </button>
      <input
        type="text"
        autoComplete="off"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value.slice(0, REASON_MAX_LENGTH))}
        maxLength={REASON_MAX_LENGTH}
        placeholder="e.g. Doctor's appointment"
        autoFocus
        className="w-full text-xs ring-1 ring-gray-300 dark:ring-gray-600 rounded p-1.5 dark:bg-gray-900 dark:text-gray-100"
      />
      <p className="text-[10px] text-gray-400 mt-0.5 text-right">{reason.length}/{REASON_MAX_LENGTH}</p>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full text-xs text-center text-sky-600 hover:underline"
      >
        Done
      </button>
    </div>
  );
}
