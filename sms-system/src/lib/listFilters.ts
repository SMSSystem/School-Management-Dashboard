import { naturalCompare } from './sortByName';

// Pure helpers for the dropdown filters on the Students, Teachers, Subjects, Houses and
// Lesson Notes lists. Every filter works on rows the page has already loaded (the cached
// users list, the subjects and classes listeners), so a filter costs no Firestore reads.
// A choice is '' (everything), NONE (rows with nothing assigned) or an id.

/** The "All ..." choice. */
export const ALL = '';
/** The "No class" / "No teacher" / "No subjects" choice. */
export const NONE = '__none__';

/**
 * A remembered choice that no longer exists (the class, subject or teacher was deleted
 * since) falls back to "All" instead of showing an empty list nobody can explain.
 */
export function validChoice(value: string, validIds: readonly string[]): string {
  return value === ALL || value === NONE || validIds.includes(value) ? value : ALL;
}

export function filterStudentsByClass<T extends { classId?: string }>(rows: T[], choice: string): T[] {
  if (choice === ALL) return rows;
  if (choice === NONE) return rows.filter((r) => !r.classId);
  return rows.filter((r) => r.classId === choice);
}

type SubjectLike = { id: string; teacherIds?: string[]; teacherNames?: string[] };

/** Teachers on a subject (the assistant is inside teacherIds, so assistants match too). */
export function filterTeachersBySubject<T extends { id: string }>(
  rows: T[],
  subjects: readonly SubjectLike[],
  choice: string,
): T[] {
  if (choice === ALL) return rows;
  if (choice === NONE) {
    const onSubject = new Set(subjects.flatMap((s) => s.teacherIds ?? []));
    return rows.filter((r) => !onSubject.has(r.id));
  }
  const ids = new Set(subjects.find((s) => s.id === choice)?.teacherIds ?? []);
  return rows.filter((r) => ids.has(r.id));
}

export function filterSubjectsByTeacher<T extends SubjectLike>(subjects: T[], choice: string): T[] {
  if (choice === ALL) return subjects;
  if (choice === NONE) return subjects.filter((s) => (s.teacherIds ?? []).length === 0);
  return subjects.filter((s) => (s.teacherIds ?? []).includes(choice));
}

/** The distinct teachers named on the subjects (id + name), in natural order of name. */
export function teacherOptions(subjects: readonly SubjectLike[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const s of subjects) {
    (s.teacherIds ?? []).forEach((id, i) => {
      if (!seen.has(id)) seen.set(id, s.teacherNames?.[i] ?? id);
    });
  }
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => naturalCompare(a.name, b.name));
}

/** Houses with at least one active student in the class (see summariseHouses). */
export function housesWithClass<T extends { id: string }>(
  houses: T[],
  summaries: Record<string, { classIds: string[] } | undefined>,
  choice: string,
): T[] {
  if (choice === ALL) return houses;
  if (choice === NONE) return houses.filter((h) => (summaries[h.id]?.classIds ?? []).length === 0);
  return houses.filter((h) => summaries[h.id]?.classIds.includes(choice));
}
