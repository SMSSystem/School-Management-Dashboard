import type { ReactNode } from "react";

// The foot of the assignment form: the save error, the upload notice, any missing-record notice and the button.
export function AssignmentFormFooter({
  submitError,
  uploading,
  isSubmitting,
  attachmentLoading,
  type,
  missingNotice,
}: {
  submitError: string | null;
  uploading: boolean;
  isSubmitting: boolean;
  attachmentLoading: boolean;
  type: "create" | "update";
  missingNotice: ReactNode;
}) {
  return (
    <>
      {submitError && <p className="text-xs text-red-400">{submitError}</p>}
      {uploading && (
        <p className="text-xs text-gray-500 dark:text-gray-300">
          Uploading the file… keep this window open until it finishes.
        </p>
      )}

      {missingNotice}
      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting || attachmentLoading}
      >
        {uploading ? "Uploading file…" : isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </>
  );
}
