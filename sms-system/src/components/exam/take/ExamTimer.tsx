import { formatRemaining, timerMessage } from "@/lib/examClock";

// The countdown on the attempt screen (EXAMS_FEATURE_SPEC.md §4.5). The number is not announced every second; a hidden
// live region speaks once as 10 minutes, 5 minutes, 1 minute and 30 seconds are reached. The colour changes in the
// last five minutes, and the words "Time left" mean the state does not rest on colour.
export default function ExamTimer({ remainingMs }: { remainingMs: number }) {
  const urgent = remainingMs <= 5 * 60_000;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">Time left</span>
      <span
        role="timer"
        aria-label="Time left"
        className={`rounded-md px-2 py-1 font-mono text-lg font-semibold tabular-nums ${
          urgent ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" : "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
        }`}
      >
        {formatRemaining(remainingMs)}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {timerMessage(remainingMs)}
      </span>
    </div>
  );
}
