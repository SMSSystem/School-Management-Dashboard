import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useExamResults } from "@/hooks/useExamResults";
import DifficultyTable from "@/components/exam/results/DifficultyTable";
import ExtraTimeDialog from "@/components/exam/results/ExtraTimeDialog";
import FinalizeDialog from "@/components/exam/results/FinalizeDialog";
import ResultsSummary from "@/components/exam/results/ResultsSummary";
import ResultsTable from "@/components/exam/results/ResultsTable";
import ActivityTimelineDialog from "@/components/exam/results/ActivityTimelineDialog";
import ResultsToolbar from "@/components/exam/results/ResultsToolbar";
import ScoreDialog from "@/components/exam/results/ScoreDialog";
import { SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import RouteFallback from "@/components/RouteFallback";
import { downloadCSV } from "@/lib/spreadsheetExport";
import { resultCsvColumns, resultsFileName, type ResultRow } from "@/lib/examResultsRows";
import { EXAM_STATUS_LABELS } from "@/types/exams";

type Dialog = { kind: "score" | "extra" | "finalize" | "timeline"; row?: ResultRow } | null;

// The staff results screen (EXAMS_FEATURE_SPEC.md §4.7): the class, where each student stands, grading, manual and
// overridden scores, extra time, release, the figures, the CSV, and Finalize. For the staff who run the exam; a
// spectator sees it and can export, with nothing to press.
const ExamResultsPage = () => {
  const { examId } = useParams();
  const r = useExamResults(examId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  if (r.loading) return <RouteFallback />;

  const back = (
    <Link to="/dashboard/list/exams" className="text-sm text-sky-700 hover:underline dark:text-sky-300">
      ← Back to exams
    </Link>
  );
  if (r.error || !r.data) {
    return (
      <div className="m-4 flex flex-1 flex-col gap-3 rounded-md bg-white p-4 dark:bg-gray-800">
        {back}
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {r.error ?? "This exam could not be found."}
        </p>
      </div>
    );
  }

  const { exam } = r.data;
  const finalized = exam.status === "finalized";
  const close = () => {
    setDialog(null);
    setDialogError(null);
  };
  // A dialog closes when its action worked; a failed action leaves it open with the message.
  const run = async (work: Promise<string | null>) => {
    const failure = await work;
    if (failure === null) close();
    else setDialogError(failure);
  };

  const leftovers = finalized && r.data.attemptCount > 0;

  return (
    <div className="m-4 flex flex-1 flex-col gap-4 rounded-md bg-white p-4 dark:bg-gray-800">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{exam.title || "Untitled exam"} — results</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{[exam.className, exam.subjectName].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
          {r.phase === "closed" && exam.status !== "closed" ? "Closed (window ended)" : EXAM_STATUS_LABELS[exam.status ?? "draft"]}
        </span>
      </div>

      {r.autoNote && (
        <p role="status" className="rounded-md bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-900/20 dark:text-sky-100">
          {r.autoNote}
        </p>
      )}
      {r.notice && (
        <div
          role={r.notice.kind === "error" ? "alert" : "status"}
          className={`flex items-start justify-between gap-3 rounded-md p-3 text-sm ${
            r.notice.kind === "error" ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200" : "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
          }`}
        >
          <span>{r.notice.text}</span>
          <button type="button" onClick={r.dismissNotice} className="min-h-11 px-2 text-xs underline md:min-h-0 md:px-0">
            Dismiss
          </button>
        </div>
      )}
      {leftovers && r.canManage && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
          <span>
            {r.data.attemptCount} student attempt{r.data.attemptCount === 1 ? " is" : "s are"} still stored from before this exam was finalized.
          </span>
          <button type="button" onClick={() => void r.cleanup()} disabled={r.busy} className={SECONDARY_BUTTON_CLS}>
            Finish clean-up
          </button>
        </div>
      )}

      <ResultsSummary counts={r.counts} stats={r.stats} maxScore={r.maxScore} writesLeft={r.writesLeft} />

      <ResultsToolbar
        canChange={r.canManage}
        busy={r.busy}
        gradeNow={r.gradeState}
        releasePending={r.releasePending}
        releaseMode={exam.releaseMode ?? "manual"}
        finalized={finalized}
        canFinalize={r.phase === "closed" && !finalized}
        difficultyShown={r.difficulty !== null}
        onGradeNow={() => void r.gradeNow()}
        onRelease={() => void r.release()}
        onExport={() => downloadCSV(resultsFileName(exam.title || exam.subjectName), r.rows, resultCsvColumns)}
        onFinalize={() => setDialog({ kind: "finalize" })}
        onDifficulty={() => void r.loadDifficulty()}
        onRefresh={() => void r.reload()}
      />

      <ResultsTable
        rows={r.rows}
        loading={r.rosterLoading}
        canChange={r.canManage}
        finalized={finalized}
        onScore={(row) => setDialog({ kind: "score", row })}
        onExtraTime={(row) => setDialog({ kind: "extra", row })}
        onRegrade={(row) => void r.regrade({ studentId: row.studentId, studentName: row.name })}
        onTimeline={(row) => setDialog({ kind: "timeline", row })}
      />

      {r.difficulty !== null && (
        <DifficultyTable
          rows={r.difficultyRows}
          source={finalized ? "Saved when the exam was finalized." : "Worked out from the submitted attempts."}
        />
      )}

      {dialog?.kind === "score" && dialog.row && (
        <ScoreDialog
          studentName={dialog.row.name}
          maxScore={r.maxScore}
          currentScore={dialog.row.score}
          currentComment={dialog.row.comment}
          busy={r.busy}
          error={dialogError}
          onClose={close}
          onSave={(v) => void run(r.saveScore({ studentId: dialog.row!.studentId, studentName: dialog.row!.name, ...v }))}
        />
      )}
      {dialog?.kind === "timeline" && dialog.row?.integrity && (
        <ActivityTimelineDialog studentName={dialog.row.name} summary={dialog.row.integrity} onClose={close} />
      )}
      {dialog?.kind === "extra" && dialog.row && (
        <ExtraTimeDialog
          studentName={dialog.row.name}
          currentExtra={dialog.row.extraMinutes}
          sitting={dialog.row.status === "In progress"}
          busy={r.busy}
          error={dialogError}
          onClose={close}
          onSave={(extraMinutes) => void run(r.giveExtraTime({ studentId: dialog.row!.studentId, studentName: dialog.row!.name, extraMinutes }))}
        />
      )}
      {dialog?.kind === "finalize" && (
        <FinalizeDialog
          blockers={r.blockersForFinalize()}
          attemptCount={r.data.attemptCount}
          gradeCount={r.data.grades.length}
          busy={r.busy}
          error={dialogError}
          onClose={close}
          onConfirm={() => void run(r.finalize())}
        />
      )}
    </div>
  );
};

export default ExamResultsPage;
