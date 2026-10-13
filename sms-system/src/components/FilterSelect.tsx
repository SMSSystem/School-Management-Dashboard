import { ALL } from "@/lib/listFilters";

// A labelled dropdown filter for the list pages (Students by class, Teachers by subject,
// Subjects by teacher, Houses by class, Lesson Notes by subject). The first option is
// "All ..."; an optional second is the "nothing assigned" choice (NONE in lib/listFilters).
// Filtering itself is client-side over rows the page already loaded: no reads.
type Option = { value: string; label: string };

const FilterSelect = ({
  label,
  value,
  onChange,
  options,
  allLabel,
  noneOption,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  allLabel: string;
  noneOption?: Option;
  className?: string;
}) => (
  <label className={`flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 ${className}`}>
    <span className="shrink-0">{label}</span>
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 max-w-48 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:text-gray-100"
    >
      <option value={ALL}>{allLabel}</option>
      {noneOption && <option value={noneOption.value}>{noneOption.label}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

export default FilterSelect;
