import { formatDateLabel } from '@/lib/generalAttendanceLogic';

// Previous and next week, and the read-only badge for a week outside the term.
export function WeekNavigator({
  prevWeek,
  nextWeek,
  canGoBack,
  canGoNext,
  weekDates,
  isReadOnly,
}: {
  prevWeek: () => void;
  nextWeek: () => void;
  canGoBack: boolean;
  canGoNext: boolean;
  weekDates: string[];
  isReadOnly: boolean;
}) {
  return (
    <>
      {/* Week navigator */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={prevWeek}
          disabled={!canGoBack}
          className="p-1.5 rounded-md border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
          aria-label="Previous week"
        >
          ←
        </button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Week of {formatDateLabel(weekDates[0])}
        </span>
        <button
          type="button"
          onClick={nextWeek}
          disabled={!canGoNext}
          className="p-1.5 rounded-md border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
          aria-label="Next week"
        >
          →
        </button>
        {isReadOnly && (
          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
            Read-only (past term)
          </span>
        )}
      </div>
    </>
  );
}
