// A row of subject chips ("All" first) that sits under a list page's Subject dropdown and shares its value
// (hooks/useSubjectFilter.ts). Shown from the md breakpoint up only: on a phone a long row of chips runs off the
// screen, and the dropdown above does the same job.
export default function SubjectFilterChips({
  subjects,
  active,
  onChange,
}: {
  subjects: readonly string[];
  active: string;
  onChange: (subject: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by subject"
      className="hidden md:flex flex-wrap gap-2"
    >
      {["", ...subjects].map((s) => {
        const pressed = s === active;
        return (
          <button
            key={s || "all"}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(s)}
            className={`shrink-0 min-h-9 rounded-full border px-3.5 text-sm font-medium transition-colors ${
              pressed
                ? "bg-sky-600 border-sky-600 text-white"
                : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            {s || "All"}
          </button>
        );
      })}
    </div>
  );
}
