import { useState } from "react";
import { Download } from "lucide-react";
import DialogShell from "@/components/DialogShell";
import { useAuth } from "@/lib/AuthContext";
import { formatFileSize } from "@/lib/documentUpload";
import { saveBlob } from "@/lib/downloadFile";
import {
  downloadRubric,
  RUBRIC_DOWNLOAD_FORMATS,
  type RubricDownloadFormat,
} from "@/lib/rubricDownload";
import { fetchRubricFile } from "@/lib/rubricFileStore";
import type { RubricDocument } from "@/types/assessment";

const OPTION_CLS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700";

type Rubric = RubricDocument & { id: string };

// The choices for downloading a rubric, in a small dialog rather than a drop-down, because a table row's cell would clip one
// (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 9). The original file costs Firestore reads and is fetched only when
// chosen. A generated copy is built from the grid already in memory, so it costs none. Callers decide who sees this
// (canDownloadRubric), and the rules refuse the file to a spectator in any case.
function DownloadChoices({
  rubric,
  onClose,
}: {
  rubric: Rubric;
  onClose: () => void;
}) {
  const { institutionId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      onClose();
    } catch {
      setError("The download failed. Check your connection and try again.");
      setBusy(false);
    }
  };
  const original = () =>
    run(async () => {
      if (!institutionId) throw new Error("No institution");
      const { blob, fileName } = await fetchRubricFile(
        institutionId,
        rubric.id,
      );
      saveBlob(blob, fileName);
    });
  const generated = (format: RubricDownloadFormat) =>
    run(() => downloadRubric(rubric, format));

  return (
    <DialogShell
      title={`Download ${rubric.title}`}
      onClose={onClose}
      busy={busy}
    >
      {rubric.file && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void original()}
          className={OPTION_CLS}
        >
          Original file
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {rubric.file.fileName} · {formatFileSize(rubric.file.size)}
          </span>
        </button>
      )}
      {rubric.criteria.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {rubric.file ? "Or the grid shown in the app, as:" : "Download as:"}
          </p>
          {RUBRIC_DOWNLOAD_FORMATS.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              disabled={busy}
              onClick={() => void generated(format)}
              className={OPTION_CLS}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {busy && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Preparing your download…
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </DialogShell>
  );
}

/** A round icon for a table row, or a labelled button for the assignment page. */
export default function RubricDownloadMenu({
  rubric,
  labelled = false,
}: {
  rubric: Rubric;
  labelled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {labelled ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download rubric
        </button>
      ) : (
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
          onClick={() => setOpen(true)}
          title={`Download ${rubric.title}`}
          aria-label={`Download ${rubric.title}`}
        >
          <Download className="h-4 w-4 text-white" aria-hidden="true" />
        </button>
      )}
      {open && (
        <DownloadChoices rubric={rubric} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
