import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import DialogShell from "@/components/DialogShell";

// "Finalize exam" (EXAMS_FEATURE_SPEC.md §6.8): what still stops it, or — when nothing does — a plain statement of what it
// removes (the attempts) and what it keeps (the scores, the results and the per-question counts), with a confirmation.
export default function FinalizeDialog({
  blockers,
  attemptCount,
  gradeCount,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  blockers: readonly string[];
  attemptCount: number;
  gradeCount: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <DialogShell title="Finalize this exam?" onClose={onClose} busy={busy}>
      {blockers.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 text-sm">
          <p className="font-medium text-red-700 dark:text-red-300">It cannot be finalized yet:</p>
          <ul className="list-disc pl-5 text-red-700 dark:text-red-300">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
          <p>
            Finalizing removes the {attemptCount} student attempt{attemptCount === 1 ? "" : "s"} (the answers each student gave). The {gradeCount} score
            {gradeCount === 1 ? "" : "s"}, the results, the per-question counts and each student’s activity summary are kept.
          </p>
          <p className="font-medium">After this the exam cannot be re-graded or edited.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={SECONDARY_BUTTON_CLS}>
          {blockers.length > 0 ? "Close" : "Cancel"}
        </button>
        {blockers.length === 0 && (
          <button type="button" onClick={onConfirm} disabled={busy} className={PRIMARY_BUTTON_CLS} style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}>
            {busy ? "Finalizing…" : "Finalize exam"}
          </button>
        )}
      </div>
    </DialogShell>
  );
}
