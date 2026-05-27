interface PaginationProps {
  /** Total number of items in the unsliced filtered dataset. */
  total: number;
  /** Current 1-based page number. */
  page: number;
  /** Number of items per page. */
  pageSize: number;
  /** Called with the new page number when the user navigates. */
  onPageChange: (page: number) => void;
}

/**
 * Returns the sequence of page-number buttons to render.
 * `null` entries represent an ellipsis gap.
 *
 * Examples (page / totalPages → sequence):
 *   1 / 5  → [1, 2, 3, 4, 5]
 *   4 / 10 → [1, null, 3, 4, 5, null, 10]
 *   1 / 10 → [1, 2, null, 10]
 */
function getPageNumbers(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | null)[] = [1];

  if (page > 3) pages.push(null); // left ellipsis

  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
    pages.push(i);
  }

  if (page < totalPages - 2) pages.push(null); // right ellipsis

  pages.push(totalPages);

  return pages;
}

const Pagination = ({ total, page, pageSize, onPageChange }: PaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="p-4 flex items-center justify-between text-gray-500 dark:text-gray-300">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="py-2 px-4 rounded-md bg-slate-200 dark:bg-gray-700 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Prev
      </button>

      <div className="flex items-center gap-2 text-sm">
        {pageNumbers.map((p, i) =>
          p === null ? (
            <span key={`ellipsis-${i}`} className="px-1 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-7 h-7 flex items-center justify-center rounded-sm ${
                p === page
                  ? "bg-lamaSky font-semibold text-gray-800"
                  : "hover:bg-lamaSkyLight dark:hover:bg-gray-700"
              }`}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="py-2 px-4 rounded-md bg-slate-200 dark:bg-gray-700 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
};

export default Pagination;
