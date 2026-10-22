import { isInClass, takesSubject, type ClassMembership } from './studentClasses';
import { noteSubjectIds, type NoteSubjectFields } from './lessonNoteSubjects';

// The classes a lesson note is for. A note written before several classes were allowed has `classId` and
// `className` (one class). A note for several has `classIds` and `classNames` (the same length, at most
// MAX_LESSON_NOTE_CLASSES) and ALSO `classId` / `className` holding the first of them, so a reader that only knows
// the one class (older code, the parent query, the audit entry) still finds the note. A note for no class has none
// of the four fields. firestore.rules checks the same shape in isValidLessonNote().
// No Firebase import: cheap to unit-test and to use from the form and the hook.

export const MAX_LESSON_NOTE_CLASSES = 20;
// Firestore's limit on the values of one `in` / `array-contains-any` filter.
export const QUERY_VALUE_LIMIT = 10;

export type NoteClassFields = NoteSubjectFields & {
  classId?: string | null;
  className?: string | null;
  classIds?: string[] | null;
  classNames?: string[] | null;
};

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Every class of the note: `classIds` when stored, else the one `classId`, else none. */
export function noteClassIds(n: NoteClassFields): string[] {
  const list = Array.isArray(n.classIds) ? n.classIds.map(text).filter(Boolean) : [];
  if (list.length > 0) return [...new Set(list)];
  const one = text(n.classId);
  return one ? [one] : [];
}

/** The class names, in the order of noteClassIds(). A name that was never stored is left out. */
export function noteClassNames(n: NoteClassFields): string[] {
  const names = Array.isArray(n.classNames) ? n.classNames.map(text) : [];
  if (names.length > 0) return names.filter(Boolean);
  const one = text(n.className);
  return one ? [one] : [];
}

/** The names as one line for a table, a card or an audit entry; '' when the note has no class. */
export function classLabel(n: NoteClassFields): string {
  return noteClassNames(n).join(', ');
}

/**
 * Can this student (or one child of a parent) see the note? They must be in one of its classes, and when the note
 * has subjects they must take at least one of them in at least one of those classes.
 */
export function isNoteVisibleTo(n: NoteClassFields, member: ClassMembership | null | undefined): boolean {
  const mine = noteClassIds(n).filter((id) => isInClass(member, id));
  if (mine.length === 0) return false;
  const subjects = noteSubjectIds(n);
  return subjects.length === 0 || mine.some((id) => subjects.some((subjectId) => takesSubject(member, id, subjectId)));
}

/** The fields to store for the classes picked in the form; null for none (the caller then removes all four). */
export function classFieldsFor(
  picked: { id: string; name: string }[],
): { classId: string; className: string; classIds: string[]; classNames: string[] } | null {
  const seen = new Set<string>();
  const unique = picked.filter((c) => c.id && !seen.has(c.id) && seen.add(c.id));
  if (unique.length === 0) return null;
  return {
    classId: unique[0].id,
    className: unique[0].name,
    classIds: unique.map((c) => c.id),
    classNames: unique.map((c) => c.name),
  };
}

/** The ids split into groups the size of one `in` / `array-contains-any` filter. */
export function idGroups(ids: readonly string[], size = QUERY_VALUE_LIMIT): string[][] {
  const unique = [...new Set(ids.filter(Boolean))];
  const groups: string[][] = [];
  for (let i = 0; i < unique.length; i += size) groups.push(unique.slice(i, i + size));
  return groups;
}
