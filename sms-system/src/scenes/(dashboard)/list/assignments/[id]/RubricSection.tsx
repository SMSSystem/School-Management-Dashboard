import RubricCarousel from "@/components/rubric/RubricCarousel";
import type { Assignment, Rubric } from "@/lib/assignmentDetailLogic";

// The rubric attached to the assignment: its criteria and performance levels as a carousel, or why there is none to
// show. Keyed by the rubric, so a different rubric starts at its first criterion.
export function RubricSection({
  assignment,
  rubric,
}: {
  assignment: Assignment;
  rubric: Rubric | null;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Rubric</h2>
      {!assignment.rubricId ? (
        <p className="text-sm text-gray-400 italic">No rubric attached.</p>
      ) : !rubric ? (
        <p className="text-sm text-gray-400 italic">
          Rubric not found — it may have been deleted since this assignment was
          created.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium">{rubric.title}</p>
          {rubric.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {rubric.description}
            </p>
          )}
          <RubricCarousel
            key={rubric.id}
            criteria={rubric.criteria}
            label={`${rubric.title} criteria`}
          />
        </>
      )}
    </div>
  );
}
