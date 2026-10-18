import type { CommitProgress } from "@/lib/spreadsheetImport";
import { SHARED_STUDENT_IMPORT_PASSWORD, type GaRebuildProgress, type Row, type TargetKey } from "@/lib/importConfig";
import { BTN_CLS } from "./importStyles";

// The last step: how many were written, the failed rows report, the attendance summary rebuild, and a restart.
export function DoneStep({
  commitResult,
  target,
  failedRows,
  downloadErrorReport,
  gaRebuildProgress,
  gaRebuildDone,
  resetAll,
}: {
  commitResult: CommitProgress;
  target: TargetKey | null;
  failedRows: (Row & { __error: string })[];
  downloadErrorReport: () => void;
  gaRebuildProgress: GaRebuildProgress | null;
  gaRebuildDone: boolean;
  resetAll: () => void;
}) {
  return (
    <div>
      <p className="text-base">
        {commitResult.done} of {commitResult.total}{" "}
        {target === "students" ? "student account(s) created" : "document(s) written"} successfully.
      </p>
      {target === "students" && commitResult.done > 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Remember to share the temporary password (
          <span className="font-mono font-medium">{SHARED_STUDENT_IMPORT_PASSWORD}</span>) with each new
          student — they&apos;ll be required to set their own on first sign-in.
        </p>
      )}
      {failedRows.length > 0 && (
        <>
          <p className="text-base text-red-500 mt-1">{failedRows.length} row(s) failed to commit.</p>
          <button
            type="button"
            className="mt-2 rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-base font-medium text-white hover:bg-sky-600"
            onClick={downloadErrorReport}
          >
            Download error report
          </button>
        </>
      )}
      {target === "general_attendance" && gaRebuildProgress && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          {gaRebuildDone
            ? `Rebuilt attendance summaries for ${gaRebuildProgress.total} affected class(es) (${gaRebuildProgress.students} summary document(s) updated).`
            : `Rebuilding attendance summaries for ${gaRebuildProgress.total} affected class(es)… ${gaRebuildProgress.done}/${gaRebuildProgress.total}`}
        </p>
      )}
      <div>
        <button type="button" className={`${BTN_CLS} mt-4`} onClick={resetAll}>
          Start another import
        </button>
      </div>
    </div>
  );
}
