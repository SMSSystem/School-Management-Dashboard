import { addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { commitWithBlob, deleteBlob } from "@/lib/blobStore";
import { assignmentAttachmentFields, type AssignmentFile } from "@/lib/assignmentFile";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import type { AssignmentFormRecord } from "@/lib/assignmentFormLogic";

// The one write of the assignment form (components/forms/AssignmentForm): adding or updating the assignment
// with its attachment. The form keeps the checks before it, the error message after a failure and closing the
// form; the sequence below is moved as it was, because the order is the point: a file over 500KB is uploaded
// first, and the file the save replaces is removed only after it succeeded.
export async function saveAssignment({
  institutionId,
  uid,
  role,
  type,
  data,
  updateId,
  payload,
  attachment,
  attachmentChanged,
  setUploading,
}: {
  institutionId: string;
  uid: string;
  role: string | null;
  type: "create" | "update";
  data: AssignmentFormRecord | undefined;
  updateId: unknown;
  payload: Record<string, unknown>;
  attachment: AssignmentFile | null;
  attachmentChanged: boolean;
  setUploading: (uploading: boolean) => void;
}): Promise<void> {
  // The stored large file this save replaces or removes (its key is on the
  // assignment already). It is deleted from the Realtime Database only after
  // the save succeeds.
  const oldBlobKey =
    type === "update" && attachmentChanged
      ? ((data?.attachmentBlobKey as string | undefined) ?? null)
      : null;

  // A file over 500KB chosen in this form is uploaded first and the
  // assignment then points at it; if the save fails the upload is taken back
  // out (see commitWithBlob). A kept or small file never touches the database.
  await commitWithBlob(
    institutionId,
    attachmentChanged ? attachment : null,
    uid,
    async (blobKey) => {
      const fields = assignmentAttachmentFields(attachment, blobKey, type === "update");
      if (type === "create") {
        await addDoc(institutionCollection(institutionId, "assignments"), {
          ...payload,
          ...fields,
          createdBy: uid,
          createdByRole: role ?? "",
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(
          institutionDoc(institutionId, "assignments", updateId as string),
          { ...payload, ...fields },
        );
      }
    },
    setUploading,
  );
  if (oldBlobKey) void deleteBlob(institutionId, oldBlobKey);
}
