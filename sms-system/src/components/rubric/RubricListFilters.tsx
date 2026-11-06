import { Search } from "lucide-react";
import FilterSelect from "@/components/FilterSelect";
import ResultCount from "@/components/ResultCount";
import { RUBRIC_TYPE_OPTIONS } from "@/lib/rubricList";

// The Rubrics page's search box, Type filter and count (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md item 2.11), in the same
// style as the Lesson Notes page. The page filters the list it already holds, so this costs no reads.
export default function RubricListFilters({
  search,
  type,
  matching,
  total,
  page,
  loading,
  onSearch,
  onType,
}: {
  search: string;
  type: string;
  matching: number;
  total: number;
  page: number;
  loading: boolean;
  onSearch: (search: string) => void;
  onType: (type: string) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search rubrics</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search rubrics…"
            className="w-full min-h-11 rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-sky-400 sm:text-sm dark:border-gray-600 dark:bg-gray-900"
          />
        </label>
        <FilterSelect
          label="Type"
          allLabel="All types"
          options={RUBRIC_TYPE_OPTIONS}
          value={type}
          onChange={onType}
        />
      </div>
      <ResultCount
        matching={matching}
        total={total}
        page={page}
        singular="rubric"
        plural="rubrics"
        loading={loading}
      />
    </div>
  );
}
