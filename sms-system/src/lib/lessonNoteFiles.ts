import { needsBlobStore } from './documentUpload';
import type { LessonNoteDocument, LessonNoteFile } from './firebase';

// Several files per lesson note (LESSON_NOTES_FEATURE_SPEC.md amendment).
// The note carries each file's metadata in `attachments` (so lists and the view
// modal show names and sizes without reading a file) and the matching document
// ids in `attachmentIds`; each file's body is its own document at
// lessonNotes/{noteId}/attachment/{id}, read only when it is downloaded.
// Pure logic, so the form, the delete cascade and the tests share one rule set.

export const MAX_LESSON_NOTE_FILES = 12; // mirrors firestore.rules' attachments.size() cap
/** Total across a note's files, enforced here only (rules cannot sum a list). */
export const MAX_LESSON_NOTE_TOTAL_BYTES = 15 * 1024 * 1024;

/** The id of the one file a note had before several were allowed. */
export const LEGACY_FILE_ID = 'data';

export const newLessonNoteFileId = (): string => crypto.randomUUID();

type NoteFileFields = Pick<
  LessonNoteDocument,
  'hasAttachment' | 'attachments' | 'attachmentFileName' | 'attachmentMimeType' | 'attachmentSize'
>;

/**
 * A note's files, in the order they were added. A note written before several
 * files were allowed has only the single-file fields; it is read as one file
 * with the legacy id, so it keeps working until the migration script has run.
 */
export function noteFiles(note: NoteFileFields): LessonNoteFile[] {
  if (Array.isArray(note.attachments)) return note.attachments;
  if (note.hasAttachment && note.attachmentFileName) {
    return [
      {
        id: LEGACY_FILE_ID,
        fileName: note.attachmentFileName,
        mimeType: note.attachmentMimeType ?? '',
        size: note.attachmentSize ?? 0,
      },
    ];
  }
  return [];
}

/** Why one more file cannot be added to a note holding `current`, or null when it can. */
export function validateAddedFile(current: readonly { size: number }[], file: { size: number }): string | null {
  if (current.length >= MAX_LESSON_NOTE_FILES) {
    return `A note can have at most ${MAX_LESSON_NOTE_FILES} files.`;
  }
  const total = current.reduce((sum, f) => sum + f.size, 0) + file.size;
  if (total > MAX_LESSON_NOTE_TOTAL_BYTES) {
    return `A note's files can total at most ${MAX_LESSON_NOTE_TOTAL_BYTES / (1024 * 1024)}MB.`;
  }
  return null;
}

export type FileChangePlan = {
  /** Document ids to create (the new files). */
  setIds: string[];
  /** Document ids to delete (files the person removed). */
  deleteIds: string[];
  /** The note's attachmentIds after the save: the kept files, then the new ones. */
  attachmentIds: string[];
};

/** What a save changes: which file documents to write and delete, and the note's new id list. */
export function planFileChanges(input: {
  existingIds: readonly string[];
  keptIds: readonly string[];
  addedIds: readonly string[];
}): FileChangePlan {
  const kept = input.existingIds.filter((id) => input.keptIds.includes(id));
  return {
    setIds: [...input.addedIds],
    deleteIds: input.existingIds.filter((id) => !input.keptIds.includes(id)),
    attachmentIds: [...kept, ...input.addedIds],
  };
}

/**
 * Which of these files can have a Realtime Database key to look up. Reading a file's
 * document downloads any inline body with it, so a file known to be small is skipped.
 * A size of 0 means unknown (older records can read back as 0), so it is looked up.
 */
export function blobLookupIds(files: readonly LessonNoteFile[], ids: readonly string[]): string[] {
  return ids.filter((id) => {
    const size = files.find((f) => f.id === id)?.size ?? 0;
    return size === 0 || needsBlobStore(size);
  });
}

/** The note-level metadata for a file (what `attachments` holds). */
export const fileMetadata = (f: LessonNoteFile): LessonNoteFile => ({
  id: f.id,
  fileName: f.fileName,
  mimeType: f.mimeType,
  size: f.size,
});

/** A short label for a list row: the name of one file, or a count. */
export function filesLabel(files: readonly LessonNoteFile[]): string {
  if (files.length === 0) return '';
  return files.length === 1 ? files[0].fileName : `${files.length} files`;
}
