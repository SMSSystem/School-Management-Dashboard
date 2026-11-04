import { useState } from "react";
import { Download } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DownloadProgress from "@/components/DownloadProgress";
import { useKeepAliveWhileOpen } from "@/hooks/useKeepAliveWhileOpen";
import { formatFileSize } from "@/lib/documentUpload";
import type { useLessonNoteDownloadAll } from "@/hooks/useLessonNoteDownloadAll";

const BUTTON_CLS =
  "w-full sm:w-auto min-h-11 md:min-h-0 inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 md:px-3 md:py-1.5 rounded-lg md:rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50";

// A long run has no taps to count as activity, so it would otherwise end in the inactivity sign-out, which also clears
// the copies on this device. Rendered only during a run.
const RUN_KEEP_ALIVE_MS = 60 * 60 * 1000;
function KeepAliveDuringRun() {
  useKeepAliveWhileOpen(RUN_KEEP_ALIVE_MS);
  return null;
}

// The Download all controls in a note's view dialog (LESSON_NOTE_12_FILES_SPEC.md section 9).
export default function DownloadAllPanel({
  download,
  mode,
}: {
  download: ReturnType<typeof useLessonNoteDownloadAll>;
  mode: "zip" | "sequential";
}) {
  const [confirming, setConfirming] = useState(false);
  const { button, run, zipDecision, skipped, message } = download;
  if (button.kind === "none") return null;

  const sizeLabel = formatFileSize(download.remainingBytes);
  const fileWord = download.remainingCount === 1 ? "file" : "files";
  const verb = mode === "zip" ? "Fetching" : "Saving";
  const label = run?.current
    ? `${verb} ${Math.min(run.processed + 1, run.total)} of ${run.total}: ${run.current}`
    : run
      ? `${run.processed} of ${run.total} done`
      : "";

  return (
    <div className="flex flex-col gap-2">
      {download.active && <KeepAliveDuringRun />}

      {!run && !zipDecision && (
        <div className="flex items-center gap-3 flex-wrap">
          {button.kind === "complete" ? (
            <>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-300">All files downloaded</span>
              {button.canSaveAgain && (
                <button type="button" className={BUTTON_CLS} onClick={() => void download.saveAgain()}>
                  Save again from this device
                </button>
              )}
            </>
          ) : skipped.length > 0 ? (
            <button type="button" className={BUTTON_CLS} onClick={() => void download.retrySkipped()}>
              <Download className="w-4 h-4" />
              Retry skipped ({skipped.length})
            </button>
          ) : (
            <button type="button" className={BUTTON_CLS} onClick={() => setConfirming(true)}>
              <Download className="w-4 h-4" />
              {button.kind === "all" ? "Download all" : `Download remaining (${button.count})`}
            </button>
          )}
        </div>
      )}

      {run && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Keep this window open until all files are downloaded. Closing it stops the download.
          </p>
          <DownloadProgress value={run.processed} max={run.total} label={label} ariaLabel="Files downloaded" />
          <div className="flex items-center gap-2 flex-wrap">
            {mode === "sequential" && run.phase === "running" && (
              <button type="button" className={BUTTON_CLS} onClick={download.pause}>
                Pause
              </button>
            )}
            {run.phase === "paused" && (
              <>
                <button type="button" className={BUTTON_CLS} onClick={download.next}>
                  Download next ({Math.min(run.processed + 1, run.total)} of {run.total})
                </button>
                <button type="button" className={BUTTON_CLS} onClick={download.resume}>
                  Resume automatic
                </button>
              </>
            )}
            <button type="button" className={BUTTON_CLS} onClick={download.stop}>
              Stop
            </button>
          </div>
        </div>
      )}

      {skipped.length > 0 && !run && (
        <p className="text-xs text-red-400">Not downloaded: {skipped.map((f) => f.fileName).join(", ")}.</p>
      )}
      {message && <p className="text-xs text-red-400">{message}</p>}

      {confirming && (
        <ConfirmDialog
          title={button.kind === "all" ? "Download all" : "Download remaining"}
          message={
            `Download ${download.remainingCount} ${fileWord} (${sizeLabel})?` +
            (mode === "sequential"
              ? " Your browser may ask you to allow several downloads. If a file does not save, use its own Download button."
              : "")
          }
          confirmLabel="Download"
          onConfirm={() => {
            setConfirming(false);
            void download.startRemaining();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}

      {zipDecision && (
        <ConfirmDialog
          title="Save what was fetched?"
          message={`Save the ${zipDecision.count} ${zipDecision.count === 1 ? "file" : "files"} fetched so far, or discard?`}
          confirmLabel="Save"
          cancelLabel="Discard"
          onConfirm={zipDecision.save}
          onCancel={zipDecision.discard}
        />
      )}
    </div>
  );
}
