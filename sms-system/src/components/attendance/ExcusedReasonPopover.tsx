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
      <input
        type="text"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value.slice(0, 50))}
        maxLength={50}
        placeholder="e.g. Doctor's appointment"
        autoFocus
        className="w-full text-xs ring-1 ring-gray-300 dark:ring-gray-600 rounded p-1.5 dark:bg-gray-900 dark:text-gray-100"
      />
      <p className="text-[10px] text-gray-400 mt-0.5 text-right">{reason.length}/50</p>
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
