import { getDoc, getDocs } from 'firebase/firestore';
import { institutionSubcollection, institutionSubdoc } from './paths';
import { LEGACY_FILE_ID } from './lessonNoteFiles';
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
 * Every file document of a note (up to five), with its Realtime Database key if
 * it has one. Used when the note is deleted: the documents are removed in the
 * same batch and the keys' files afterwards. One read per file document. If the
 * list cannot be read it falls back to the single legacy document id, so the
 * delete still goes ahead; whatever it misses is left for the owner-run sweep.
 */
export async function noteFileDocs(
  institutionId: string,
  lessonNoteId: string,
): Promise<{ id: string; blobKey: string | null }[]> {
  try {
    const snap = await getDocs(institutionSubcollection(institutionId, 'lessonNotes', lessonNoteId, 'attachment'));
    return snap.docs.map((d) => {
      const key = d.data().blobKey;
      return { id: d.id, blobKey: typeof key === 'string' ? key : null };
    });
  } catch {
    return [{ id: LEGACY_FILE_ID, blobKey: null }];
  }
}

/**
 * The Realtime Database keys of some of a note's files, by file id (files held
 * inline, missing, or unreadable are left out). One read per id. Call it BEFORE
 * the write that replaces or deletes those documents, since a key is lost with
 * its document. Never throws: a miss only leaves a file for the owner-run sweep.
 */
export async function existingBlobKeys(
  institutionId: string,
  lessonNoteId: string,
  fileIds: readonly string[],
): Promise<Record<string, string>> {
  const keys: Record<string, string> = {};
  await Promise.all(
    fileIds.map(async (id) => {
      try {
        const snap = await getDoc(institutionSubdoc(institutionId, 'lessonNotes', lessonNoteId, 'attachment', id));
        const key = snap.data()?.blobKey;
        if (typeof key === 'string') keys[id] = key;
      } catch {
        // Non-fatal: the sweep script clears it.
      }
    }),
  );
  return keys;
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
