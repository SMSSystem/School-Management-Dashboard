import { useEffect, useRef } from "react";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";

// "Submit your exam?" (EXAMS_FEATURE_SPEC.md §4.5): says how many questions are unanswered and flagged before the
// attempt is ended. Escape or Go back returns to the exam; the focus starts on Go back so Enter cannot submit by
// accident.
export default function SubmitDialog({
  total,
  unanswered,
  flagged,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  total: number;
  unanswered: number;
  flagged: number;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const goBack = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    goBack.current?.focus();
    return () => before?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) cancelRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [submitting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="submit-title"
        aria-describedby="submit-detail"
        className="flex w-full max-w-md flex-col gap-4 rounded-md bg-white p-5 dark:bg-gray-800"
      >
        <h2 id="submit-title" className="text-lg font-semibold">
          Submit your exam?
        </h2>
        <div id="submit-detail" className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
          <p>
            You have answered {total - unanswered} of {total} question{total === 1 ? "" : "s"}.
          </p>
          {unanswered > 0 && (
            <p className="font-medium text-amber-700 dark:text-amber-300">
              {unanswered} question{unanswered === 1 ? " is" : "s are"} not answered.
            </p>
          )}
          {flagged > 0 && (
            <p className="font-medium text-amber-700 dark:text-amber-300">
              {flagged} question{flagged === 1 ? " is" : "s are"} flagged for review.
            </p>
          )}
          <p>After you submit you cannot change your answers.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button ref={goBack} type="button" onClick={onCancel} disabled={submitting} className={SECONDARY_BUTTON_CLS}>
            Go back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={PRIMARY_BUTTON_CLS}
            style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
          >
            {submitting ? "Submitting…" : "Submit exam"}
          </button>
        </div>
      </div>
    </div>
  );
}
