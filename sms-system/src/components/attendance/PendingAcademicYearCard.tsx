interface Props { draftYearName: string; }

export function PendingAcademicYearCard({ draftYearName }: Props) {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md p-4">
      <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        Academic Year {draftYearName} Pending Review
      </h3>
      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
        The next academic year has been generated. Review and confirm the term dates,
        public holidays, and non-school days before activating.
      </p>
      <a
        href="/academic-calendar"
        className="inline-block mt-2 text-xs font-medium text-amber-800 dark:text-amber-300 underline"
      >
        Review Academic Calendar →
      </a>
    </div>
  );
}
