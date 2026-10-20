import { StatusBadge } from "./StatusBadge";
import type { Submission } from "@/lib/assignmentDetailLogic";

// A parent's view of their child's submission in this assignment's class, with a download link.
export function ParentSubmissionSection({
  childId,
  childSubmission,
}: {
  childId: string | null;
  childSubmission: Submission | null;
}) {
  return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your Child's Submission</h2>
        {!childId ? (
          <p className="text-sm text-gray-400 italic">
            No linked child found in this assignment's class.
          </p>
        ) : childSubmission ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-sm">{childSubmission.fileName}</span>
                <span className="text-xs text-gray-400">
                  {Math.round(childSubmission.fileSize / 1024)} KB
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={childSubmission.status} />
                <a
                  href={childSubmission.fileDataUrl}
                  download={childSubmission.fileName}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Download
                </a>
              </div>
            </div>
            {childSubmission.status === "graded" && (
              <div className="text-sm rounded-md bg-gray-50 dark:bg-gray-900 p-3">
                <p className="font-medium">
                  Grade: {childSubmission.grade} / {childSubmission.maxGrade}
                </p>
                {childSubmission.feedback && (
                  <p className="text-gray-600 dark:text-gray-300 mt-1">{childSubmission.feedback}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Your child hasn't submitted anything yet.</p>
        )}
      </div>
  );
}
