import { getDoc } from 'firebase/firestore';
import { institutionSubdoc } from './paths';
import type { ProcessedDocument } from './documentUpload';

// How a lesson note's file is recorded (LARGE_ATTACHMENTS_RTDB_SPEC.md, section
// 4.2): the sub-document lessonNotes/{id}/attachment/data holds EITHER the file
// itself (dataUrl, up to 500KB) OR a blobKey pointing at the Realtime Database
// (up to 5MB), never both. firestore.rules enforces the same.

/** The attachment sub-document's fields for a file, embedded or by key. */
export function attachmentData(
  file: Pick<ProcessedDocument, 'dataUrl' | 'fileName' | 'mimeType' | 'size'>,
  blobKey: string | null,
): Record<string, unknown> {
  const meta = { fileName: file.fileName, mimeType: file.mimeType, size: file.size };
  return blobKey ? { blobKey, ...meta } : { dataUrl: file.dataUrl, ...meta };
}

/**
 * The key of a note's current large file, or null (no file, an embedded file,
 * or unreadable). One read. Call it BEFORE the write that replaces or deletes
 * the sub-document, since the key is lost with it; the caller then removes the
 * old file from the Realtime Database after that write succeeds. Never throws:
 * a miss only leaves a file for the owner-run sweep.
 */
export async function existingBlobKey(institutionId: string, lessonNoteId: string): Promise<string | null> {
  try {
    const snap = await getDoc(institutionSubdoc(institutionId, 'lessonNotes', lessonNoteId, 'attachment', 'data'));
    const key = snap.data()?.blobKey;
    return typeof key === 'string' ? key : null;
  } catch {
    return null;
  }
}
