import { getDoc } from 'firebase/firestore';
import { institutionSubdoc } from './paths';
import type { LessonNoteAttachmentDocument } from './firebase';
import { BlobMissingError, BlobStoppedError, getBlobDataUrl } from './blobStore';
import { dataUrlToBlob, saveBlob } from './downloadFile';
import { getStoredFile, markDownloaded, storeFile, type NoteFileRef } from './noteFileStore';

// Fetches one of a note's files on demand (LESSON_NOTES_FEATURE_SPEC.md §6). One getDoc() against that file's
// attachment/{id} sub-document, and a Realtime Database read for a large file — nothing is read until the user asks,
// and nothing at all when this device already holds a copy (noteFileStore.ts).
//
// Deliberately NOT a React Query hook: queryClient.ts persists query results
// to sessionStorage (~5MB), and a base64 payload of up to ~700KB would blow
// that quota after a handful of opens.

export type NoteFileOptions = { strictCounter?: boolean; role?: string | null };

/** The rules refused this person the file: a student or parent may read only the files of their or their child's classes. */
export class NoteFileRefusedError extends Error {
  constructor(role?: string | null) {
    super(
      role === 'parent'
        ? "This file is for a class your child isn't in. Contact the school if you need it."
        : 'This file is for another class. Ask your teacher if you need it.',
    );
    this.name = 'NoteFileRefusedError';
  }
}

/** Reads a file from Firebase. `strictCounter` refuses a large file whose download could not be counted. */
export async function fetchLessonNoteFile(
  institutionId: string,
  lessonNoteId: string,
  fileId: string,
  options: NoteFileOptions = {},
): Promise<Blob> {
  const snap = await getDoc(
    institutionSubdoc(institutionId, 'lessonNotes', lessonNoteId, 'attachment', fileId),
  ).catch((error: unknown) => {
    if ((error as { code?: string } | null)?.code === 'permission-denied') throw new NoteFileRefusedError(options.role);
    throw error;
  });
  if (!snap.exists()) throw new BlobMissingError('This note’s file is no longer available.');
  const file = snap.data() as LessonNoteAttachmentDocument;

  // A file over ~500KB is in the Realtime Database; fetch it only now, on demand.
  const dataUrl = file.blobKey ? await getBlobDataUrl(institutionId, file.blobKey, file.size, options) : file.dataUrl;
  if (!dataUrl) throw new BlobMissingError('This note’s file is no longer available.');
  return dataUrlToBlob(dataUrl);
}

/**
 * What a failed read means for Download all: a stop ends the run, a missing or refused file will not change on a
 * retry, and anything else may be the network.
 */
export function classifyNoteFileFailure(error: unknown): 'retry' | 'skip' | 'halt' {
  if (error instanceof BlobStoppedError) return 'halt';
  return error instanceof BlobMissingError || error instanceof NoteFileRefusedError ? 'skip' : 'retry';
}

/**
 * This device's copy of a file if it has one, otherwise from Firebase, keeping a copy for next time. A copy is not
 * checked against the rules again, so one saved before a student changed class stays until they sign out.
 */
export async function loadNoteFile(
  uid: string,
  institutionId: string,
  lessonNoteId: string,
  file: NoteFileRef,
  options: NoteFileOptions = {},
): Promise<Blob> {
  const stored = await getStoredFile(uid, lessonNoteId, file);
  if (stored) return stored;
  const blob = await fetchLessonNoteFile(institutionId, lessonNoteId, file.id, options);
  await storeFile(uid, lessonNoteId, file, blob);
  return blob;
}

/** One file, as a download: hands it to the browser and records that it was downloaded. */
export async function downloadLessonNoteAttachment(
  uid: string,
  institutionId: string,
  lessonNoteId: string,
  file: NoteFileRef,
  options: NoteFileOptions = {},
): Promise<void> {
  saveBlob(await loadNoteFile(uid, institutionId, lessonNoteId, file, options), file.fileName);
  await markDownloaded(uid, lessonNoteId, [file.id]);
}
