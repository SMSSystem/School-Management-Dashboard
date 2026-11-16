import { useState } from "react";
import {
  initialAttachment,
  type AssignmentFormRecord,
} from "@/lib/assignmentFormLogic";
import type { AssignmentFile } from "@/lib/assignmentFile";

// The attachment as stored: embedded (attachmentDataUrl) or, for a file over
// 500KB, only its key in the Realtime Database (attachmentBlobKey) — the body
// is not loaded for editing. attachmentChanged turns true once a file is
// chosen or removed here; until then the stored file is kept as it is.
export function useAssignmentAttachment(
  data: AssignmentFormRecord | undefined,
) {
  const [attachment, setAttachment] = useState<AssignmentFile | null>(() =>
    initialAttachment(data),
  );
  const [attachmentChanged, setAttachmentChanged] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  return {
    attachment,
    setAttachment,
    attachmentChanged,
    setAttachmentChanged,
    uploading,
    setUploading,
    attachmentLoading,
    setAttachmentLoading,
    attachmentError,
    setAttachmentError,
  };
}
