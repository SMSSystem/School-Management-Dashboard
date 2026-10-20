import type { Assignment, RosterStudent, Submission } from "@/lib/assignmentDetailLogic";

// Grade one student's submission: the file, the score and maximum (fixed to the linked column in gradebook
// mode), and feedback.
export function GradeDialog({
  assignment,
  gradingTarget,
  submissionsByStudent,
  gradeScore,
  setGradeScore,
  gradeMaxScore,
  setGradeMaxScore,
  gradeFeedback,
  setGradeFeedback,
  gradingError,
  gradingLoading,
  setGradingTarget,
  handleGradeSubmit,
}: {
  assignment: Assignment;
  gradingTarget: RosterStudent;
  submissionsByStudent: Record<string, Submission>;
  gradeScore: string;
  setGradeScore: (value: string) => void;
  gradeMaxScore: string;
  setGradeMaxScore: (value: string) => void;
  gradeFeedback: string;
  setGradeFeedback: (value: string) => void;
  gradingError: string | null;
  gradingLoading: boolean;
  setGradingTarget: (student: RosterStudent | null) => void;
  handleGradeSubmit: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Grade — {gradingTarget.name}</h2>

        {submissionsByStudent[gradingTarget.uid] && (
          <div className="flex items-center justify-between gap-4 text-sm">
            <span>{submissionsByStudent[gradingTarget.uid].fileName}</span>
            <a
              href={submissionsByStudent[gradingTarget.uid].fileDataUrl}
              download={submissionsByStudent[gradingTarget.uid].fileName}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Download
            </a>
          </div>
        )}

        <div className="flex gap-4">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-xs text-gray-500 dark:text-gray-300">Score</label>
            <input
              type="number"
              min={0}
              value={gradeScore}
              onChange={(e) => setGradeScore(e.target.value)}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
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
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-60"
            />
          </div>
        </div>
        {assignment.gradingMode === "gradebook" && (
          <p className="text-xs text-gray-400 -mt-2">
            Max score is fixed to the linked Gradebook column.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-300">Feedback (optional)</label>
          <textarea
            value={gradeFeedback}
            onChange={(e) => setGradeFeedback(e.target.value)}
            rows={3}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

        {gradingError && <p className="text-xs text-red-400">{gradingError}</p>}

        <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
            onClick={() => setGradingTarget(null)}
            disabled={gradingLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={gradingLoading}
            className="bg-blue-500 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
            onClick={handleGradeSubmit}
          >
            {gradingLoading ? "Saving…" : "Save Grade"}
          </button>
        </div>
      </div>
    </div>
  );
}
