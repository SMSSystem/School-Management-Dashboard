// Previous / Next for a cursor-paginated list (hooks/useCursorPages.ts). There is
// no page total: Firestore pages by cursor, and counting would cost extra reads.
// Buttons are 44px tall on phones, matching the app's other touch targets.
const buttonClass =
  "min-h-11 sm:min-h-0 px-4 py-2 rounded-md bg-slate-200 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed";

const PagerControls = ({
  pageIndex,
  hasPrevious,
  hasNext,
  isFetching = false,
  onPrevious,
  onNext,
}: {
  /** Zero-based; shown as "Page N". */
  pageIndex: number;
  hasPrevious: boolean;
  hasNext: boolean;
  isFetching?: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) => {
  if (!hasPrevious && !hasNext) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-gray-500 dark:text-gray-300">
      <button type="button" className={buttonClass} disabled={!hasPrevious || isFetching} onClick={onPrevious}>
        Previous
      </button>
      {/* Fixed height so a page change does not make the layout jump. */}
      <span className="text-xs h-4 leading-4" aria-live="polite">
        {isFetching ? "Loading…" : `Page ${pageIndex + 1}`}
      </span>
      <button type="button" className={buttonClass} disabled={!hasNext || isFetching} onClick={onNext}>
        Next
      </button>
    </div>
  );
};

export default PagerControls;
