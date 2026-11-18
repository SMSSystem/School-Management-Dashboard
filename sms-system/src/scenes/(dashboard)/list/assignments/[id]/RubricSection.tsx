import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import RubricCarousel from "@/components/rubric/RubricCarousel";
import {
  getPersistedFilter,
  setPersistedFilter,
} from "@/lib/filterPersistence";
import RubricDownloadMenu from "@/components/rubric/RubricDownloadMenu";
import RubricFileDetails from "@/components/rubric/RubricFileDetails";
import type { Assignment, Rubric } from "@/lib/assignmentDetailLogic";
import { isFileOnly } from "@/lib/rubricFileKinds";
import { canDownloadRubric, canUploadRubric } from "@/lib/roleCapabilities";
import type { Role } from "@/types/people";

// The rubric attached to the assignment: its criteria and performance levels as a carousel, or why there is none to
// show, and its downloads. This is the only place students and parents reach a rubric (RUBRICS_UPLOAD_SPEC.md D3). Keyed by
// the rubric, so a different rubric starts at its first criterion. A read-only account views a rubric but can't download it,
// so a rubric that holds only a file has just its name to show there. Students and parents get a line on how to use it
// (RUBRICS_UPLOAD_SPEC.md D15): plain text, not a tour.
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
  // Students and parents get the section as an accordion: closed at first, so the assignment itself comes first,
  // and opened or closed by its header. The choice is remembered for the session (lib/filterPersistence.ts). Staff
  // keep the open card.
  const foldable = role === "student" || role === "parent";
  const [open, setOpenState] = useState(
    () => !foldable || getPersistedFilter("assignment-rubric", "open") === "1",
  );
  const toggle = () => {
    setOpenState(!open);
    setPersistedFilter("assignment-rubric", "open", open ? "" : "1");
  };
  const bodyId = useId();
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
      {foldable ? (
        <h2 className="text-lg font-semibold">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex w-full min-h-11 items-center justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              Rubric
              {rubric && (
                <span className="block truncate text-sm font-normal text-gray-500 dark:text-gray-400">
                  {rubric.title}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        </h2>
      ) : (
        <h2 className="text-lg font-semibold">Rubric</h2>
      )}
      {open && (
        <div id={bodyId} className="flex flex-col gap-3">
          {!assignment.rubricId ? (
            <p className="text-sm text-gray-400 italic">No rubric attached.</p>
          ) : !rubric ? (
            <p className="text-sm text-gray-400 italic">
              Rubric not found — it may have been deleted since this assignment
              was created.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">{rubric.title}</p>
              {rubric.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {rubric.description}
                </p>
              )}
              <RubricFileDetails
                rubric={rubric}
                staff={canUploadRubric(role)}
              />
              {(role === "student" || role === "parent") && (
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  {isFileOnly(rubric)
                    ? "Download the rubric to see how this work will be marked."
                    : "This shows how this work will be marked. Move through the criteria with the arrows or the list, or swipe on a phone. Use Download rubric to keep a copy."}
                </p>
              )}
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
      )}
    </div>
  );
}
