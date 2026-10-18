import { DocumentValidationError, formatFileSize, processDocumentUpload, uploadLimitLabel } from "@/lib/documentUpload";
import type { AssignmentFile } from "@/lib/assignmentFile";
import { LABEL_CLS } from "./styles";

// The optional attachment: pick, replace or remove a file (processed in the browser), with the size limit for
// the signed-in role and the processing and error lines. Choosing or removing a file marks the attachment as
// changed, so an untouched stored file is never re-uploaded.
export function AttachmentField({
  attachment,
  setAttachment,
  setAttachmentChanged,
  attachmentLoading,
  setAttachmentLoading,
  attachmentError,
  setAttachmentError,
  uploadPolicy,
}: {
  attachment: AssignmentFile | null;
  setAttachment: (attachment: AssignmentFile | null) => void;
  setAttachmentChanged: (changed: boolean) => void;
  attachmentLoading: boolean;
  setAttachmentLoading: (loading: boolean) => void;
  attachmentError: string | null;
  setAttachmentError: (error: string | null) => void;
  uploadPolicy: Parameters<typeof processDocumentUpload>[1] extends { large?: infer L } | undefined ? L : never;
}) {
  return (
    <>
    <div className="flex flex-col gap-2 w-full">
      <label className={LABEL_CLS}>Attachment (optional)</label>
      <div className="flex items-center gap-3">
        <label className="cursor-pointer text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
          {attachment ? "Replace file" : "Upload file"}
          <input
            type="file"
            accept=".pdf,.docx,.pptx,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setAttachmentError(null);
              setAttachmentLoading(true);
              try {
                setAttachment(await processDocumentUpload(file, { large: uploadPolicy }));
                setAttachmentChanged(true);
              } catch (err) {
                setAttachmentError(
                  err instanceof DocumentValidationError
                    ? err.message
                    : "Could not process this file.",
                );
              } finally {
                setAttachmentLoading(false);
              }
            }}
          />
        </label>
        {attachment && (
          <>
            <span className="text-xs text-gray-500 dark:text-gray-300">
              {attachment.fileName} ({formatFileSize(attachment.size)})
            </span>
            <button
              type="button"
              onClick={() => {
                setAttachmentError(null);
                setAttachment(null);
                setAttachmentChanged(true);
              }}
              className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700"
            >
              Remove
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-gray-400">
        PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP — {uploadLimitLabel(uploadPolicy)} max.
      </p>
      {attachmentLoading && (
        <p className="text-xs text-gray-400">Processing file…</p>
      )}
      {attachmentError && (
        <p className="text-xs text-red-400">{attachmentError}</p>
      )}
    </div>
    </>
  );
}
