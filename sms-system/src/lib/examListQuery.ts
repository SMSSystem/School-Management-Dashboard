import { classIdsOf, type ClassMembership } from './studentClasses';

// Which exams a student's or a parent's Exams list asks Firestore for (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md
// §4.5, §9). The list used to listen to every exam of the institution; a student or a parent now reads only the exams
// of the classes involved (one query per 30 classes, equality filter only, so no index), once, and the answer is cached.
// Pure and Firebase-free.

/** Firestore's `in` filter takes at most 30 values. */
export const EXAM_CLASS_QUERY_LIMIT = 30;

/** The class ids to read exams for: the student's own classes, or the classes of all the parent's children. */
export function examListClassIds(
  who: { role: 'student'; membership: ClassMembership } | { role: 'parent'; children: readonly ClassMembership[] },
): string[] {
  const ids = who.role === 'student' ? classIdsOf(who.membership) : who.children.flatMap((child) => classIdsOf(child));
  return [...new Set(ids)].sort();
}

/** The ids in groups the `in` filter accepts. */
export function classIdGroups(ids: readonly string[], size = EXAM_CLASS_QUERY_LIMIT): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < ids.length; i += size) groups.push(ids.slice(i, i + size));
  return groups;
}
