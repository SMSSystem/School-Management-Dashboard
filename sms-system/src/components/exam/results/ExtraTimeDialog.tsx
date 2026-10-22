import { useState } from "react";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { EXAM_LIMITS } from "@/types/exams";
import DialogShell from "@/components/DialogShell";

// Extra time for one student (EXAMS_FEATURE_SPEC.md §5.6): their total extra minutes, applied when they start and, if
// they are sitting the exam now, added to their deadline (their screen picks it up at its next save).
export default function ExtraTimeDialog({
  studentName,
  currentExtra,
  sitting,
  busy,
  error,
  onSave,
  onClose,
}: {
  studentName: string;
  currentExtra: number;
  /** The student has an attempt in progress. */
  sitting: boolean;
  busy: boolean;
  error: string | null;
  onSave: (extraMinutes: number) => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(String(currentExtra > 0 ? currentExtra : 10));
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const n = Number(minutes);
    if (!Number.isInteger(n) || n < 1 || n > EXAM_LIMITS.maxExtraMinutes) {
      setProblem(`Enter a whole number of minutes from 1 to ${EXAM_LIMITS.maxExtraMinutes}.`);
    } else {
      setProblem(null);
      onSave(n);
    }
  };

  return (
    <DialogShell title={`Extra time for ${studentName}`} onClose={onClose} busy={busy}>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {currentExtra > 0 ? `${studentName} has ${currentExtra} minutes of extra time now.` : `${studentName} has no extra time yet.`}{" "}
        {sitting ? "They are sitting the exam, so their finishing time moves later and their screen updates at its next save." : "It applies when they start."}
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor="extra-minutes" className="text-xs text-gray-500 dark:text-gray-300">
          Total extra minutes (1 to {EXAM_LIMITS.maxExtraMinutes})
        </label>
        <input
          id="extra-minutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={EXAM_LIMITS.maxExtraMinutes}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>
      {(problem || error) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {problem ?? error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BUTTON_CLS}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={busy} className={PRIMARY_BUTTON_CLS} style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}>
          {busy ? "Saving…" : "Give extra time"}
        </button>
      </div>
    </DialogShell>
  );
}
