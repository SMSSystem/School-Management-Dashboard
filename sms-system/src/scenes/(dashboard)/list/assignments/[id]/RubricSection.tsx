import RubricCarousel from "@/components/rubric/RubricCarousel";
import RubricDownloadMenu from "@/components/rubric/RubricDownloadMenu";
import RubricFileDetails from "@/components/rubric/RubricFileDetails";
import type { Assignment, Rubric } from "@/lib/assignmentDetailLogic";
import { isFileOnly } from "@/lib/rubricFileKinds";
import { canDownloadRubric, canUploadRubric } from "@/lib/roleCapabilities";
import type { Role } from "@/types/people";

// The rubric attached to the assignment: its criteria and performance levels as a carousel, or why there is none to
// show, and its downloads. This is the only place students and parents reach a rubric (RUBRICS_UPLOAD_SPEC.md D3). Keyed by
// the rubric, so a different rubric starts at its first criterion. A read-only account views a rubric but can't download it,
// so a rubric that holds only a file has just its name to show there.
export function RubricSection({
  assignment,
  rubric,
  role,
}: {
  assignment: Assignment;
  rubric: Rubric | null;
  role: Role | null;
}) {
  const canDownload = canDownloadRubric(role);
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
          <RubricFileDetails rubric={rubric} staff={canUploadRubric(role)} />
          {isFileOnly(rubric) ? (
            !canDownload && (
              <p className="text-sm italic text-gray-400">
                Not available on a read-only account.
              </p>
            )
          ) : (
            <RubricCarousel
              key={rubric.id}
              criteria={rubric.criteria}
              label={`${rubric.title} criteria`}
            />
          )}
          {canDownload && <RubricDownloadMenu rubric={rubric} labelled />}
        </>
      )}
    </div>
  );
}
