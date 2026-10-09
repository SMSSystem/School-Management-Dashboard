// Pure decisions for scripts/migrate-lesson-note-files.mjs (no I/O, so they can be
// unit tested from src/lib/__tests__/migrateLessonNoteFiles.test.ts).
// See docs/miscellaneous-specs/LESSON_NOTES_FEATURE_SPEC.md (several files per note).

/** The id of the one file a note had before several were allowed: attachment/data. */
export const LEGACY_FILE_ID = 'data';

/** The single-file fields the form no longer writes. */
export const LEGACY_FIELDS = ['attachmentFileName', 'attachmentMimeType', 'attachmentSize'];

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;

/**
 * What to do with one note.
 *   - already:  it has the new `attachments` list (nothing to do);
 *   - no-file:  it has no file, so the single-file reading (no files) is already right;
 *   - missing-file: it says it has a file but attachment/data is gone, or has no
 *     name to list; reported and never written (the owner decides);
 *   - migrate:  write `attachments` and `attachmentIds` for its one file.
 * `legacyFile` is the data of attachment/data (metadata fields only are used), or
 * null when that document does not exist.
 */
export function planNoteMigration(note, legacyFile) {
  if (Array.isArray(note.attachments)) return { action: 'already' };
  if (note.hasAttachment !== true) return { action: 'no-file' };
  if (!legacyFile) return { action: 'missing-file', reason: 'attachment/data does not exist' };
  const fileName = isNonEmptyString(legacyFile.fileName) ? legacyFile.fileName : note.attachmentFileName;
  if (!isNonEmptyString(fileName)) return { action: 'missing-file', reason: 'the file has no name' };
  const mimeType = isNonEmptyString(legacyFile.mimeType)
    ? legacyFile.mimeType
    : isNonEmptyString(note.attachmentMimeType)
      ? note.attachmentMimeType
      : '';
  const rawSize = typeof legacyFile.size === 'number' ? legacyFile.size : note.attachmentSize;
  const size = typeof rawSize === 'number' && rawSize >= 0 ? rawSize : 0;
  return {
    action: 'migrate',
    update: {
      attachments: [{ id: LEGACY_FILE_ID, fileName, mimeType, size }],
      attachmentIds: [LEGACY_FILE_ID],
    },
  };
}

/**
 * --drop-legacy: the single-file fields that can be deleted from a note. Only a
 * note that already has the new list qualifies, so a file is never left with no
 * record of its name.
 */
export function legacyFieldsToDrop(note) {
  if (!Array.isArray(note.attachments)) return [];
  return LEGACY_FIELDS.filter((f) => f in note);
}

/** Counts for the summary line. */
export function tally(outcomes) {
  const counts = { migrate: 0, already: 0, 'no-file': 0, 'missing-file': 0, dropLegacy: 0 };
  for (const o of outcomes) {
    if (o in counts) counts[o]++;
  }
  return counts;
}
