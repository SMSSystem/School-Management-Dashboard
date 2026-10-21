import { Download } from "lucide-react";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";

// The actions above the table (EXAMS_FEATURE_SPEC.md §4.7): Grade now (with the reason when it is off), Release (only when
// the exam releases on the teacher's press and something is waiting), Export CSV (everyone, a spectator too), Finalize,
// and the question-difficulty button. A spectator is given no way to change anything.
export default function ResultsToolbar({
  canChange,
  busy,
  gradeNow,
  releasePending,
  releaseMode,
  finalized,
  canFinalize,
  difficultyShown,
  onGradeNow,
  onRelease,
  onExport,
  onFinalize,
  onDifficulty,
  onRefresh,
}: {
  canChange: boolean;
  busy: boolean;
  gradeNow: { enabled: boolean; reason: string | null };
  releasePending: number;
  releaseMode: "auto" | "scheduled" | "manual";
  finalized: boolean;
  canFinalize: boolean;
  difficultyShown: boolean;
  onGradeNow: () => void;
  onRelease: () => void;
  onExport: () => void;
  onFinalize: () => void;
  onDifficulty: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canChange && !finalized && (
        <button
          type="button"
          onClick={onGradeNow}
          disabled={busy || !gradeNow.enabled}
          title={gradeNow.reason ?? undefined}
          className={PRIMARY_BUTTON_CLS}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          Grade now
        </button>
      )}
      {canChange && releaseMode === "manual" && (
        <button type="button" onClick={onRelease} disabled={busy || releasePending === 0} className={SECONDARY_BUTTON_CLS}>
          Release{releasePending > 0 ? ` (${releasePending})` : ""}
        </button>
      )}
      <button type="button" onClick={onExport} className={SECONDARY_BUTTON_CLS}>
        <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
      </button>
      {!difficultyShown && (
        <button type="button" onClick={onDifficulty} disabled={busy} className={SECONDARY_BUTTON_CLS}>
          Show question difficulty
        </button>
      )}
      <button type="button" onClick={onRefresh} disabled={busy} className={SECONDARY_BUTTON_CLS}>
        Refresh
      </button>
      {canChange && !finalized && (
        <button type="button" onClick={onFinalize} disabled={busy || !canFinalize} className={SECONDARY_BUTTON_CLS}>
          Finalize exam
        </button>
      )}
      {!canChange && <span className="text-xs text-gray-500 dark:text-gray-400">You can view and export these results, not change them.</span>}
      {canChange && !gradeNow.enabled && !finalized && gradeNow.reason && (
        <span className="text-xs text-gray-500 dark:text-gray-400">{gradeNow.reason}</span>
      )}
    </div>
  );
}
