import FormModal from "@/components/FormModal";
import { canEditAssignment, formatDueDate, type Assignment } from "@/lib/assignmentDetailLogic";

// The assignment's title, subject, class, teacher, due date and badges, with (for editors) Convert to Gradebook
// and the edit form, and the description.
export function AssignmentInfoCard({
  assignment,
  typeLabel,
  role,
  openConversionModal,
}: {
  assignment: Assignment;
  typeLabel: string;
  role: string | null;
  openConversionModal: () => Promise<void>;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-md flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <div className="flex-1 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            {assignment.title ?? `${assignment.subjectName} — ${assignment.className}`}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{assignment.subjectName}</span>
            <span>·</span>
            <span>{assignment.className}</span>
            <span>·</span>
            <span>{assignment.teacherName}</span>
            <span>·</span>
            <span>
              Due{" "}
              {formatDueDate(assignment.dueDate)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
              {typeLabel}
            </span>
            {assignment.status && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  assignment.status === "published"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {assignment.status === "published" ? "Published" : "Draft"}
              </span>
            )}
          </div>
        </div>
        {canEditAssignment(role) && (
          <div className="flex items-center gap-2">
            {assignment.gradingMode === "standalone" && (
              <button
                type="button"
                onClick={openConversionModal}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Convert to Gradebook
              </button>
            )}
            <FormModal
              table="assignment"
              type="update"
              data={assignment as unknown as Record<string, string | number | readonly string[] | undefined>}
            />
          </div>
        )}
      </div>

      {assignment.description ? (
        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
          {assignment.description}
        </p>
      ) : (
        <p className="text-sm text-gray-400 italic">No description.</p>
      )}
    </div>
  );
}
