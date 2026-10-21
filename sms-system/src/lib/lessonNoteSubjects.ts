// The subjects a lesson note is for, the same shape as its classes (lib/lessonNoteClasses.ts). A note written before
// several subjects were allowed has `subjectId` and `subjectName` (one subject). A note for several has `subjectIds`
// and `subjectNames` (the same length, at most MAX_LESSON_NOTE_SUBJECTS) and ALSO `subjectId` / `subjectName` holding
// the first of them, so a reader that only knows the one subject still finds it. A note for no subject has none of
// the four fields. firestore.rules checks the same shape in isValidLessonNote(); it never reads a subject to decide
// who can see a note (the page and the hook do, with isNoteVisibleTo()).
// No Firebase import: cheap to unit-test and to use from the form, the hook and the page.

export const MAX_LESSON_NOTE_SUBJECTS = 5;

export type NoteSubjectFields = {
  subjectId?: string | null;
  subjectName?: string | null;
  subjectIds?: string[] | null;
  subjectNames?: string[] | null;
};

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Every subject of the note: `subjectIds` when stored, else the one `subjectId`, else none. */
export function noteSubjectIds(n: NoteSubjectFields): string[] {
  const list = Array.isArray(n.subjectIds) ? n.subjectIds.map(text).filter(Boolean) : [];
  if (list.length > 0) return [...new Set(list)];
  const one = text(n.subjectId);
  return one ? [one] : [];
}

/** The subject names, in the order of noteSubjectIds(). A name that was never stored is left out. */
export function noteSubjectNames(n: NoteSubjectFields): string[] {
  const names = Array.isArray(n.subjectNames) ? n.subjectNames.map(text) : [];
  if (names.length > 0) return names.filter(Boolean);
  const one = text(n.subjectName);
  return one ? [one] : [];
}

/** The names as one line for a table or a card; '' when the note has no subject. */
export function subjectLabel(n: NoteSubjectFields): string {
  return noteSubjectNames(n).join(', ');
}

/** The fields to store for the subjects picked in the form; null for none (the caller then removes all four). */
export function subjectFieldsFor(
  picked: { id: string; name: string }[],
): { subjectId: string; subjectName: string; subjectIds: string[]; subjectNames: string[] } | null {
  const seen = new Set<string>();
  const unique = picked.filter((s) => s.id && !seen.has(s.id) && seen.add(s.id));
  if (unique.length === 0) return null;
  return {
    subjectId: unique[0].id,
    subjectName: unique[0].name,
    subjectIds: unique.map((s) => s.id),
    subjectNames: unique.map((s) => s.name),
  };
}
