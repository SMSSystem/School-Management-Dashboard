import Table from "@/components/Table";
import type { ResultRow, ResultStatus } from "@/lib/examResultsRows";

const CHIP: Record<ResultStatus, string> = {
  "Not started": "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  "In progress": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  Submitted: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  Expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Graded: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "Re-grade needed": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
  Released: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
};

const COLUMNS = [
  { header: "Student", accessor: "name" },
  { header: "Status", accessor: "status" },
  { header: "Score", accessor: "score" },
  { header: "Tab switches", accessor: "tabs", className: "hidden lg:table-cell" },
  { header: "Extra time", accessor: "extra", className: "hidden lg:table-cell" },
  { header: "Graded by", accessor: "gradedBy", className: "hidden lg:table-cell" },
  { header: "Actions", accessor: "actions" },
];

const scoreText = (r: ResultRow) => (r.score === null ? "—" : `${r.score} / ${r.maxScore}${r.percent !== null ? ` (${r.percent}%)` : ""}`);
const gradedByText = (r: ResultRow) => (r.method ? `${r.gradedByName}${r.method === "manual" ? " (by hand)" : ""}` : "—");

const BTN = "rounded-md px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-300 hover:bg-sky-50 dark:text-sky-300 dark:ring-sky-700 dark:hover:bg-sky-900/20";

// The students of the class and where each stands (EXAMS_FEATURE_SPEC.md §4.7). The buttons are shown only to someone who
// can change the exam; a spectator sees the table and nothing to press. A table from the large width up, cards below it.
export default function ResultsTable({
  rows,
  loading,
  canChange,
  finalized,
  onScore,
  onExtraTime,
  onRegrade,
}: {
  rows: readonly ResultRow[];
  loading: boolean;
  canChange: boolean;
  finalized: boolean;
  onScore: (row: ResultRow) => void;
  onExtraTime: (row: ResultRow) => void;
  onRegrade: (row: ResultRow) => void;
}) {
  const buttons = (r: ResultRow) =>
    canChange && (
      <div className="flex flex-wrap gap-1">
        <button type="button" className={BTN} onClick={() => onScore(r)} aria-label={`${r.hasGrade ? "Change the score of" : "Enter a score for"} ${r.name}`}>
          {r.hasGrade ? "Change score" : "Enter score"}
        </button>
        {!finalized && r.status !== "Submitted" && r.status !== "Expired" && !r.hasGrade && (
          <button type="button" className={BTN} onClick={() => onExtraTime(r)} aria-label={`Give ${r.name} extra time`}>
            Extra time
          </button>
        )}
        {!finalized && r.hasGrade && r.fromAttempt && (
          <button type="button" className={BTN} onClick={() => onRegrade(r)} aria-label={`Re-grade ${r.name}`}>
            Re-grade
          </button>
        )}
      </div>
    );

  const chip = (r: ResultRow) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[r.status]}`}>{r.status}</span>;

  return (
    <Table
      columns={COLUMNS}
      data={[...rows]}
      loading={loading}
      renderRow={(r: ResultRow) => (
        <tr key={r.studentId} className="border-b border-gray-200 text-sm even:bg-slate-50 dark:border-gray-700 dark:even:bg-gray-800/60">
          <td className="p-4 font-medium">{r.name}</td>
          <td>{chip(r)}</td>
          <td>{scoreText(r)}</td>
          <td className="hidden lg:table-cell">{r.tabSwitches ?? "—"}</td>
          <td className="hidden lg:table-cell">{r.extraMinutes > 0 ? `${r.extraMinutes} min` : "—"}</td>
          <td className="hidden lg:table-cell">{gradedByText(r)}</td>
          <td>{buttons(r)}</td>
        </tr>
      )}
      renderCard={(r: ResultRow) => (
        <li key={r.studentId} className="flex flex-col gap-2 rounded-md p-3 ring-1 ring-gray-200 dark:ring-gray-700">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{r.name}</span>
            {chip(r)}
          </div>
          <p className="text-sm">{scoreText(r)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Tab switches: {r.tabSwitches ?? "—"}
            {r.extraMinutes > 0 ? ` · Extra time: ${r.extraMinutes} min` : ""}
            {r.method ? ` · Graded by ${gradedByText(r)}` : ""}
          </p>
          {buttons(r)}
        </li>
      )}
    />
  );
}
