import { useState } from "react";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { GRADE_COMMENT_MAX, MANUAL_REASON_MAX } from "@/lib/examGradingLogic";
import DialogShell from "@/components/DialogShell";

const INPUT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";

// Enter a score, or change one (EXAMS_FEATURE_SPEC.md §6.4): a number from 0 to the maximum, an optional comment the
// student sees with the score, and — when a score already exists — a required reason that is kept on the grade. The
// result of the screen's own checks is shown here; examGrading.ts checks again before anything is written.
export default function ScoreDialog({
  studentName,
  maxScore,
  currentScore,
  currentComment,
  busy,
  error,
  onSave,
  onClose,
}: {
  studentName: string;
  maxScore: number;
  /** The score now, when there is one: the dialog is then an override and needs a reason. */
  currentScore: number | null;
  currentComment: string;
  busy: boolean;
  error: string | null;
  onSave: (v: { score: number; reason: string; comment: string }) => void;
  onClose: () => void;
}) {
  const override = currentScore !== null;
  const [score, setScore] = useState(currentScore === null ? "" : String(currentScore));
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState(currentComment);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    const n = Number(score);
    if (score.trim() === "" || !Number.isFinite(n) || n < 0 || n > maxScore) {
      setProblem(`Enter a score from 0 to ${maxScore}.`);
    } else if (override && reason.trim() === "") {
      setProblem("Give a reason for changing this score.");
    } else {
      setProblem(null);
      onSave({ score: n, reason, comment });
    }
  };

  return (
    <DialogShell title={override ? `Change the score of ${studentName}` : `Enter a score for ${studentName}`} onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-1">
        <label htmlFor="score-value" className="text-xs text-gray-500 dark:text-gray-300">
          Score out of {maxScore}
        </label>
        <input id="score-value" type="number" inputMode="decimal" min={0} max={maxScore} step="any" value={score} onChange={(e) => setScore(e.target.value)} className={INPUT_CLS} />
      </div>
      {override && (
        <div className="flex flex-col gap-1">
          <label htmlFor="score-reason" className="text-xs text-gray-500 dark:text-gray-300">
            Reason (required, kept with the score)
          </label>
          <input id="score-reason" type="text" maxLength={MANUAL_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT_CLS} />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="score-comment" className="text-xs text-gray-500 dark:text-gray-300">
          Comment the student and parent will see (optional)
        </label>
        <textarea id="score-comment" rows={3} maxLength={GRADE_COMMENT_MAX} value={comment} onChange={(e) => setComment(e.target.value)} className={INPUT_CLS} />
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
          {busy ? "Saving…" : "Save score"}
        </button>
      </div>
    </DialogShell>
  );
}
