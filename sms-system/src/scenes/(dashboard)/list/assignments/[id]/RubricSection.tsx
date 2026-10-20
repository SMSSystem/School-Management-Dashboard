import Table from "@/components/Table";
import type { RubricDocument } from "@/lib/firebase";
import { rubricColumns, type Assignment, type Rubric } from "@/lib/assignmentDetailLogic";

// The rubric attached to the assignment: its criteria and performance levels, or why there is none to show.
export function RubricSection({ assignment, rubric }: { assignment: Assignment; rubric: Rubric | null }) {
  const renderRubricRow = (criterion: RubricDocument["criteria"][number]) => (
    <tr
      key={criterion.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm align-top"
    >
      <td className="p-4 font-medium">{criterion.name}</td>
      <td className="hidden md:table-cell">{criterion.maxPoints}</td>
      <td className="py-2">
        <div className="flex flex-col gap-1">
          {criterion.levels.map((lvl, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium">{lvl.label}</span> ({lvl.points} pts)
              {lvl.description ? <span className="text-gray-400"> — {lvl.description}</span> : null}
            </div>
          ))}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Rubric</h2>
      {!assignment.rubricId ? (
        <p className="text-sm text-gray-400 italic">No rubric attached.</p>
      ) : !rubric ? (
        <p className="text-sm text-gray-400 italic">
          Rubric not found — it may have been deleted since this assignment was created.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium">{rubric.title}</p>
          {rubric.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{rubric.description}</p>
          )}
          <Table columns={rubricColumns} renderRow={renderRubricRow} data={rubric.criteria} />
        </>
      )}
    </div>
  );
}
