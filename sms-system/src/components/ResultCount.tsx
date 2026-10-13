import { PAGE_SIZE } from "@/lib/utils";
import { countLabel } from "@/lib/listFilters";

// The "Showing 21-40 of 42 students (240 total)" line in a list's top bar. It counts
// every row that passes the dropdown and the search, across all pages (the same length
// the pagination gets), so it follows the filters as they change. Announced politely to
// screen readers. The numbers are array lengths already in memory: no reads.
const ResultCount = ({
  matching,
  total,
  page,
  singular,
  plural,
  loading,
  capLimit,
}: {
  matching: number;
  total: number;
  page: number;
  singular: string;
  plural: string;
  loading?: boolean;
  capLimit?: number;
}) => (
  <p role="status" aria-live="polite" className="basis-full min-h-5 text-sm text-gray-500 dark:text-gray-400">
    {countLabel({ matching, total, page, pageSize: PAGE_SIZE, singular, plural, loading, capLimit })}
  </p>
);

export default ResultCount;
