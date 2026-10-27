import type { DifficultyRow } from "@/lib/examResultsRows";

// Per-question difficulty (EXAMS_FEATURE_SPEC.md §6.6): of the students who answered a question, the share who got it
// exactly right. A low share is a hard question, or a key worth checking. Partial credit does not count as right.
export default function DifficultyTable({ rows, source }: { rows: readonly DifficultyRow[]; source: string }) {
  return (
    <section aria-label="Question difficulty" className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">Question difficulty</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400">{source}</p>
      {/* A phone gets a card per question; the table keeps its five columns from md up. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.questionId} className="flex flex-col gap-1 rounded-md p-3 text-sm ring-1 ring-gray-200 dark:ring-gray-700">
            <p>
              <span className="mr-2 text-xs font-semibold text-gray-500 dark:text-gray-400">{r.number}</span>
              {r.text}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Answered {r.answered} · Got it right {r.correct} · {r.percent === null ? "—" : `${r.percent}%`} right
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              <th className="p-2">#</th>
              <th className="p-2">Question</th>
              <th className="p-2">Answered</th>
              <th className="p-2">Got it right</th>
              <th className="p-2">Share right</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.questionId} className="border-b border-gray-100 dark:border-gray-800">
                <td className="p-2">{r.number}</td>
                <td className="p-2">{r.text}</td>
                <td className="p-2">{r.answered}</td>
                <td className="p-2">{r.correct}</td>
                <td className="p-2">{r.percent === null ? "—" : `${r.percent}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
