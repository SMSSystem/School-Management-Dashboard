import { useState } from "react";
import { formatFileSize, needsBlobStore } from "@/lib/documentUpload";
import { getBlobDataUrl } from "@/lib/blobStore";
import { saveDataUrl } from "@/lib/downloadFile";
import type { AssignmentDocument } from "@/lib/firebase";

const BUTTON_CLS =
  "text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50";

// The teacher's attachment on the assignment page, for every role that can open
// it. A small file is embedded in the assignment and downloaded straight from
// there; a large one (attachmentBlobKey) is fetched from the Realtime Database
// only when Download is clicked, never when the page opens.
const AssignmentAttachment = ({
  assignment,
  institutionId,
}: {
  assignment: Pick<
    AssignmentDocument,
    "attachmentDataUrl" | "attachmentBlobKey" | "attachmentFileName" | "attachmentSize"
  >;
  institutionId: string | null;
}) => {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!assignment.attachmentDataUrl && !assignment.attachmentBlobKey) {
    return <p className="text-sm text-gray-400 italic">No attachment.</p>;
  }

  const fileName = assignment.attachmentFileName ?? "attachment";
  const size = assignment.attachmentSize;

  const downloadLarge = async () => {
    if (!assignment.attachmentBlobKey || !institutionId) return;
    setError(null);
    setDownloading(true);
    try {
      await saveDataUrl(await getBlobDataUrl(institutionId, assignment.attachmentBlobKey), fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the file.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-sm">{fileName}</span>
          {typeof size === "number" && <span className="text-xs text-gray-400">{formatFileSize(size)}</span>}
        </div>
        {assignment.attachmentBlobKey ? (
          <button type="button" onClick={downloadLarge} disabled={downloading} className={BUTTON_CLS}>
            {downloading ? "Downloading…" : "Download"}
          </button>
        ) : (
          <a href={assignment.attachmentDataUrl} download={fileName} className={BUTTON_CLS}>
            Download
          </a>
        )}
      </div>
      {downloading && typeof size === "number" && needsBlobStore(size) && (
        <p className="text-xs text-gray-400">This is a large file and may take a moment.</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
};

export default AssignmentAttachment;
