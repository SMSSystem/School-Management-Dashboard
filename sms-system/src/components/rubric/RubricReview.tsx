import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import DialogShell from "@/components/DialogShell";
import {
  PRIMARY_BUTTON_CLS,
  SECONDARY_BUTTON_CLS,
} from "@/components/exam/builder/builderStyles";
import RubricCriteriaEditor from "@/components/rubric/RubricCriteriaEditor";
import { validateCriteria } from "@/lib/rubricCriteria";
import type { RubricCriterion } from "@/types/assessment";

// The grid read from a file, for the teacher to check before anything is saved (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md
// section 7.1). It uses the form's editor and the form's checks. A rubric read from a file holds that file, so its grid may be
// emptied. Closing goes back a step rather than losing the edits, and nothing is written until Save.
export default function RubricReview({
  heading,
  fileName,
  warnings,
  replacesGrid,
  criteria,
  onChange,
  saveLabel,
  busy,
  error,
  onBack,
  onSave,
}: {
  /** The rubric's title and its place in the queue, such as "Rubric 1 of 2: Essay". */
  heading?: string;
  fileName: string;
  warnings: readonly string[];
  /** This rubric already has a grid, which saving will replace. */
  replacesGrid: boolean;
  criteria: RubricCriterion[];
  onChange: Dispatch<SetStateAction<RubricCriterion[]>>;
  saveLabel: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSave: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const save = () => {
    const found = validateCriteria(criteria, true);
    setProblem(found);
    if (!found) onSave();
  };
  return (
    <DialogShell title="Review the grid" onClose={onBack} busy={busy} wide>
      {heading && <p className="text-sm font-medium">{heading}</p>}
      <p className="text-sm text-gray-700 dark:text-gray-300">
        This is what the app read from {fileName}. Check it and fix anything
        that's wrong. Only this grid is kept, not the file.
      </p>
      {replacesGrid && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Saving replaces this rubric's current grid, on every assignment using
          it.
        </p>
      )}
      {warnings.map((warning) => (
        <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ))}
      <RubricCriteriaEditor
        criteria={criteria}
        onChange={onChange}
        canRemoveLast
      />
      {(problem ?? error) && (
        <p role="alert" className="text-xs text-red-500">
          {problem ?? error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className={SECONDARY_BUTTON_CLS}
        >
          Back
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className={`${PRIMARY_BUTTON_CLS} disabled:opacity-50`}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          {busy ? "Saving…" : saveLabel}
        </button>
      </div>
    </DialogShell>
  );
}
