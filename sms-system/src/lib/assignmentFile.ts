import { deleteField } from 'firebase/firestore';
import type { ProcessedDocument } from './documentUpload';

// How an assignment's teacher attachment is recorded
// (LARGE_ATTACHMENTS_RTDB_SPEC.md, section 4.2): on the assignment document
// itself, EITHER the file's body (attachmentDataUrl, up to 500KB) OR a key
// pointing at the Realtime Database (attachmentBlobKey, up to 5MB), never both.
// firestore.rules enforces the same. Student submissions are not covered here;
// they always stay inline.

/** The attachment as the form holds it: a body, or (for an existing large file) just its key. */
export type AssignmentFile = Pick<ProcessedDocument, 'dataUrl' | 'fileName' | 'mimeType' | 'size'> & {
  blobKey?: string;
};

/**
 * The attachment fields to write on the assignment.
 *  - no file: nothing on create; on update every attachment field is cleared;
 *  - a file already stored by key (blobKey on the file): kept as is;
 *  - a newly chosen file: by `newBlobKey` when it was uploaded to the Realtime
 *    Database (null when it is small enough to embed).
 * On update the field of the OTHER kind is cleared, so a document never ends up
 * with both a body and a key. deleteField() is only valid against an existing
 * document, hence nothing is cleared on create.
 */
export function assignmentAttachmentFields(
  file: AssignmentFile | null,
  newBlobKey: string | null,
  isUpdate: boolean,
): Record<string, unknown> {
  if (!file) {
    return isUpdate
      ? {
          attachmentDataUrl: deleteField(),
          attachmentBlobKey: deleteField(),
          attachmentFileName: deleteField(),
          attachmentMimeType: deleteField(),
          attachmentSize: deleteField(),
        }
      : {};
  }
  const meta = {
    attachmentFileName: file.fileName,
    attachmentMimeType: file.mimeType,
    attachmentSize: file.size,
  };
  const key = file.blobKey ?? newBlobKey;
  if (key) {
    return { attachmentBlobKey: key, ...meta, ...(isUpdate && { attachmentDataUrl: deleteField() }) };
  }
  return { attachmentDataUrl: file.dataUrl, ...meta, ...(isUpdate && { attachmentBlobKey: deleteField() }) };
}

