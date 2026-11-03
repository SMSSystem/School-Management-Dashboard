// A native progress bar with its text beside it, in the institution's button colour. Used for the lesson note form's
// allowance and upload progress. It moves in steps, since a single Firebase read or write reports no byte-level progress.
const DownloadProgress = ({ value, max, label, ariaLabel }: { value: number; max: number; label: string; ariaLabel: string }) => (
  <div className="flex flex-col gap-1 w-full">
    <progress
      value={value}
      max={max}
      aria-label={ariaLabel}
      className="w-full h-2 overflow-hidden rounded-full appearance-none accent-(--brand-button-bg,#0284c7) bg-gray-200 dark:bg-gray-700 [&::-webkit-progress-bar]:bg-gray-200 dark:[&::-webkit-progress-bar]:bg-gray-700 [&::-webkit-progress-value]:bg-(--brand-button-bg,#0284c7) [&::-moz-progress-bar]:bg-(--brand-button-bg,#0284c7)"
    />
    <p className="text-xs text-gray-500 dark:text-gray-300" aria-live="polite">
      {label}
    </p>
  </div>
);

export default DownloadProgress;
