import type { Assignment, RosterStudent, Submission } from "@/lib/assignmentDetailLogic";
import { useOffline } from "@/hooks/useOffline";
import { rubricFill, scoreState, type RubricPicks } from "@/lib/rubricScoring";
import type { RubricCriterion } from "@/types/assessment";
import { RubricScorePicker } from "./RubricScorePicker";

// What the rubric's picks put in Score and Max Score: in gradebook mode the total scaled to the column, whose max stays.
function fillFor(
  assignment: Assignment,
  criteria: RubricCriterion[],
  picks: RubricPicks,
  columnMax: number | null,
  maxScoreText: string,
) {
  const gradebookMax =
    assignment.gradingMode === "gradebook" ? (columnMax ?? Number(maxScoreText)) : null;
  return rubricFill(criteria, picks, gradebookMax);
}

// The picks' fill, once at least one criterion is scored (all of them, with `complete`), or null.
function fillWhen(
  scored: "any" | "complete",
  ...args: Parameters<typeof fillFor>
): { score: string; maxScore: string } | null {
  const kind = scoreState(args[1], args[2]).kind;
  const ok = scored === "complete" ? kind === "complete" : kind !== "none";
  return ok ? fillFor(...args) : null;
}

const INPUT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-60";

// Score and Max Score (fixed to the linked column in gradebook mode), and a note when the score was changed from the
// rubric's total.
function ScoreFields({
  assignment,
  gradeScore,
  setGradeScore,
  gradeMaxScore,
  setGradeMaxScore,
  rubricScore,
}: {
  assignment: Assignment;
  gradeScore: string;
  setGradeScore: (value: string) => void;
  gradeMaxScore: string;
  setGradeMaxScore: (value: string) => void;
  rubricScore: string | null;
}) {
  return (
    <>
      <div className="flex gap-4">
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs text-gray-500 dark:text-gray-300">Score</label>
          <input
            type="number"
            min={0}
            value={gradeScore}
            onChange={(e) => setGradeScore(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs text-gray-500 dark:text-gray-300">Max Score</label>
          <input
            type="number"
            min={1}
            value={gradeMaxScore}
            onChange={(e) => setGradeMaxScore(e.target.value)}
            disabled={assignment.gradingMode === "gradebook"}
            className={INPUT_CLS}
          />
        </div>
      </div>
      {assignment.gradingMode === "gradebook" && (
        <p className="text-xs text-gray-400 -mt-2">
          Max score is fixed to the linked Gradebook column.
          {rubricScore !== null && " The rubric total is scaled to it."}
        </p>
      )}
      {rubricScore !== null && Number(gradeScore) !== Number(rubricScore) && (
        <p className="text-xs text-amber-700 dark:text-amber-300 -mt-2">
          Score was changed from the rubric total ({rubricScore}). The rubric
          scores are still saved.
        </p>
      )}
    </>
  );
}

// The submitted file and its download link.
function SubmissionFile({ submission }: { submission: Submission }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span>{submission.fileName}</span>
      <a
        href={submission.fileDataUrl}
        download={submission.fileName}
        className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        Download
      </a>
    </div>
  );
}

// The error, the offline note, and Cancel and Save Grade. Saving needs the server, so Save Grade waits while offline.
function GradeActions({
  gradingError,
  gradingLoading,
  onCancel,
  onSave,
}: {
  gradingError: string | null;
  gradingLoading: boolean;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  const offline = useOffline();
  return (
    <>
      {gradingError && <p className="text-xs text-red-400">{gradingError}</p>}
      {offline && (
        <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
          You're offline. Your picks stay here; save when you're back online.
        </p>
      )}
      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
        <button
          type="button"
          className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
          onClick={onCancel}
          disabled={gradingLoading}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={gradingLoading || offline}
          className="bg-blue-500 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
          onClick={onSave}
        >
          {gradingLoading ? "Saving…" : "Save Grade"}
        </button>
      </div>
    </>
  );
}

type GradeDialogProps = {
  assignment: Assignment;
  gradingTarget: RosterStudent;
  submissionsByStudent: Record<string, Submission>;
  gradeScore: string;
  setGradeScore: (value: string) => void;
  gradeMaxScore: string;
  setGradeMaxScore: (value: string) => void;
  gradeFeedback: string;
  setGradeFeedback: (value: string) => void;
  criteria: RubricCriterion[];
  rubricPicks: RubricPicks;
  setRubricPicks: (picks: RubricPicks) => void;
  gradebookColumnMaxScore: number | null;
  gradingError: string | null;
  gradingLoading: boolean;
  setGradingTarget: (student: RosterStudent | null) => void;
  handleGradeSubmit: () => Promise<void>;
};

// The rubric's levels, when it has a grid, and Score and Max Score, which each pick fills in.
function RubricAndScore(
  props: Pick<
    GradeDialogProps,
    | "assignment"
    | "criteria"
    | "rubricPicks"
    | "setRubricPicks"
    | "gradebookColumnMaxScore"
    | "gradeScore"
    | "setGradeScore"
    | "gradeMaxScore"
    | "setGradeMaxScore"
    | "gradingLoading"
  >,
) {
  const { assignment, criteria, rubricPicks, gradebookColumnMaxScore, gradeMaxScore } = props;
  const onPicks = (picks: RubricPicks) => {
    props.setRubricPicks(picks);
    const next = fillWhen("any", assignment, criteria, picks, gradebookColumnMaxScore, gradeMaxScore);
    if (!next) return;
    props.setGradeScore(next.score);
    props.setGradeMaxScore(next.maxScore);
  };
  const rubricScore =
    fillWhen("complete", assignment, criteria, rubricPicks, gradebookColumnMaxScore, gradeMaxScore)?.score ?? null;
  return (
    <>
      {criteria.length > 0 && (
        <RubricScorePicker
          criteria={criteria}
          picks={rubricPicks}
          onChange={onPicks}
          disabled={props.gradingLoading}
        />
      )}
      <ScoreFields
        assignment={assignment}
        gradeScore={props.gradeScore}
        setGradeScore={props.setGradeScore}
        gradeMaxScore={gradeMaxScore}
        setGradeMaxScore={props.setGradeMaxScore}
        rubricScore={rubricScore}
      />
    </>
  );
}

// Grade one student's submission: the file, the rubric's levels when it has a grid, the score and maximum, and
// feedback. Saving needs the server, so Save Grade waits while offline and the picks stay in the dialog.
export function GradeDialog(props: GradeDialogProps) {
  const { gradingTarget, gradeFeedback, setGradeFeedback } = props;
  const submission = props.submissionsByStudent[gradingTarget.uid];
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md max-h-full overflow-y-auto flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Grade — {gradingTarget.name}</h2>

        {submission && <SubmissionFile submission={submission} />}

        <RubricAndScore {...props} />

        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-300">Feedback (optional)</label>
          <textarea
            value={gradeFeedback}
            onChange={(e) => setGradeFeedback(e.target.value)}
            rows={3}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        <GradeActions
          gradingError={props.gradingError}
          gradingLoading={props.gradingLoading}
          onCancel={() => props.setGradingTarget(null)}
          onSave={props.handleGradeSubmit}
        />
      </div>
    </div>
  );
}
