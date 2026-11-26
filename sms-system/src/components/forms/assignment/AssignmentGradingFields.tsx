import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { rubricPickerOptions, type AssignmentFormValues } from "@/lib/assignmentFormLogic";
import { LABEL_CLS, SELECT_CLS } from "./styles";

// How the assignment is graded (locked after creation), the gradebook column it feeds, and its rubric.
export function AssignmentGradingFields({
  register,
  errors,
  type,
  watchedGradingMode,
  gradebookId,
  gradebookColumns,
  rubrics,
  rubricsLoading,
  currentRubricId,
  frozenRubricTitle,
}: {
  register: UseFormRegister<AssignmentFormValues>;
  errors: FieldErrors<AssignmentFormValues>;
  type: "create" | "update";
  watchedGradingMode: AssignmentFormValues["gradingMode"];
  gradebookId: string | null;
  gradebookColumns: { id: string; label: string; maxScore: number; order: number }[];
  rubrics: { id: string; title: string }[];
  rubricsLoading: boolean;
  currentRubricId: string | undefined;
  // Set once grading started: the rubric is then fixed (rubricFreeze.ts), shown as text, and kept by a hidden field.
  frozenRubricTitle: string | undefined;
}) {
  return (
    <>
    <div className="flex flex-col gap-2 w-full md:w-1/4">
      <label className={LABEL_CLS}>Grading</label>
      <select
        className={SELECT_CLS}
        disabled={type === "update"}
        {...register("gradingMode")}
      >
        <option value="gradebook">Add to Gradebook</option>
        <option value="standalone">Standalone (not in Gradebook)</option>
      </select>
      {type === "update" && (
        // Locked post-creation — ASSIGNMENTS_FEATURE_SPEC.md §4.5/§3
        // decision 21: standalone -> gradebook is one-way and only
        // happens via the dedicated "Convert to Gradebook" action on the
        // assignment detail page, which retroactively rescales every
        // already-graded student's result against the target column.
        // Allowing a free edit here would silently corrupt that math
        // instead of going through it.
        <p className="text-xs text-gray-400">
          Use "Convert to Gradebook" on the assignment page to change this.
        </p>
      )}
      {errors.gradingMode?.message && (
        <p className="text-xs text-red-400">{errors.gradingMode.message}</p>
      )}
    </div>

    {watchedGradingMode === "gradebook" && (
      <div className="flex flex-col gap-2 w-full md:w-1/4">
        <label className={LABEL_CLS}>Gradebook column</label>
        <select
          className={SELECT_CLS}
          disabled={type === "update" || !gradebookId}
          {...register("gradebookColumnId")}
        >
          <option value="">
            {gradebookId
              ? gradebookColumns.length
                ? "Select a column"
                : "No columns yet for this class/subject/term"
              : "Select term, subject, and class first"}
          </option>
          {gradebookColumns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} (/{c.maxScore})
            </option>
          ))}
        </select>
        {errors.gradebookColumnId?.message && (
          <p className="text-xs text-red-400">
            {errors.gradebookColumnId.message}
          </p>
        )}
      </div>
    )}

    <div className="flex flex-col gap-2 w-full md:w-1/4">
      <label className={LABEL_CLS}>Rubric (optional)</label>
      <RubricPicker
        register={register}
        rubrics={rubrics}
        rubricsLoading={rubricsLoading}
        currentRubricId={currentRubricId}
        frozenRubricTitle={frozenRubricTitle}
      />
    </div>
    </>
  );
}

// The rubric: a picker that keeps the saved rubric while the list loads or after it was deleted, or, once grading
// started, the frozen rubric's title with a hidden field that keeps its id.
function RubricPicker({
  register,
  rubrics,
  rubricsLoading,
  currentRubricId,
  frozenRubricTitle,
}: {
  register: UseFormRegister<AssignmentFormValues>;
  rubrics: { id: string; title: string }[];
  rubricsLoading: boolean;
  currentRubricId: string | undefined;
  frozenRubricTitle: string | undefined;
}) {
  return (
    <>
      {frozenRubricTitle !== undefined ? (
        <>
          <input type="hidden" {...register("rubricId")} />
          <p className={SELECT_CLS}>{frozenRubricTitle}</p>
          <p className="text-xs text-gray-400">
            The rubric can't change once grading has started.
          </p>
        </>
      ) : (
        <select className={SELECT_CLS} {...register("rubricId")} value={currentRubricId ?? ""}>
          {rubricPickerOptions(rubrics, currentRubricId, rubricsLoading).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
