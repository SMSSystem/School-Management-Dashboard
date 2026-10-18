import { StatusBadge } from "./StatusBadge";
import type { Submission } from "@/lib/assignmentDetailLogic";

// A student's own submission, with the file picker to submit or resubmit.
export function StudentSubmissionSection({
  mySubmission,
  handleUpload,
  uploadLoading,
  uploadError,
}: {
  mySubmission: Submission | null;
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  uploadLoading: boolean;
  uploadError: string | null;
}) {
  return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your Submission</h2>
        {mySubmission ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-sm">{mySubmission.fileName}</span>
                <span className="text-xs text-gray-400">
                  Attempt {mySubmission.currentAttemptNumber} · {Math.round(mySubmission.fileSize / 1024)} KB
                </span>
              </div>
              <StatusBadge status={mySubmission.status} />
            </div>
            {mySubmission.status === "graded" && (
              <div className="text-sm rounded-md bg-gray-50 dark:bg-gray-900 p-3">
                <p className="font-medium">
                  Grade: {mySubmission.grade} / {mySubmission.maxGrade}
                </p>
                {mySubmission.feedback && (
                  <p className="text-gray-600 dark:text-gray-300 mt-1">{mySubmission.feedback}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">You haven't submitted anything yet.</p>
        )}

        <label className="cursor-pointer self-start text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
          {mySubmission ? "Resubmit" : "Submit work"}
          <input
            type="file"
            accept=".pdf,.docx,.pptx,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleUpload}
            disabled={uploadLoading}
          />
        </label>
        {uploadLoading && <p className="text-xs text-gray-400">Submitting…</p>}
        {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
      </div>
  );
}
