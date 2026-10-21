import type { ClassStats } from "@/lib/examStats";
import type { ResultCounts } from "@/lib/examResultsRows";

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex flex-col rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-900/40">
    <dd className="text-lg font-semibold">{value}</dd>
    <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
  </div>
);

const fixed = (n: number | null) => (n === null ? "—" : String(n));

// The counts and the class figures at the top of the results screen (EXAMS_FEATURE_SPEC.md §4.7, §6.6): how many students
// started, submitted, were graded, were released and need a re-grade, and the average, lowest and highest score. The note
// under them says how much writing is left, so a teacher can plan around the daily limit (§9).
export default function ResultsSummary({
  counts,
  stats,
  maxScore,
  writesLeft,
}: {
  counts: ResultCounts;
  stats: ClassStats;
  maxScore: number;
  writesLeft: number;
}) {
  return (
    <section aria-label="Summary" className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Started" value={counts.started} />
        <Stat label="Submitted" value={counts.submitted} />
        <Stat label="Graded" value={counts.graded} />
        <Stat label="Released" value={counts.released} />
        <Stat label="Re-grade needed" value={counts.needsRegrade} />
        <Stat label="Waiting to be graded" value={counts.ungraded} />
      </dl>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label={`Average (out of ${maxScore})`} value={fixed(stats.average)} />
        <Stat label="Lowest" value={fixed(stats.min)} />
        <Stat label="Highest" value={fixed(stats.max)} />
      </dl>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {writesLeft > 0
          ? `About ${writesLeft} writes are still to come (a grade and a results entry for each score), out of the free plan’s 20,000 a day. `
          : ""}
        Report cards see a score only once it has been released and copied into the results, which happens when this page is opened or Release is pressed.
      </p>
    </section>
  );
}
