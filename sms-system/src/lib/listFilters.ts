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

/**
 * The line above a list: "Showing 21-40 of 42 students (240 total)".
 *  - `matching` is every row that passes the dropdown and the search, across all pages;
 *    `total` is the list before them, so "(N total)" appears only when something narrows it;
 *  - the page is clamped to the last page, so a stale page number never reads wrong;
 *  - `capLimit` (Lesson Notes, when only the newest rows were loaded) adds "newest 100 only";
 *  - while the list is loading it shows an ellipsis, never a misleading 0.
 */
export function countLabel(p: {
  matching: number;
  total: number;
  page: number;
  pageSize: number;
  singular: string;
  plural: string;
  loading?: boolean;
  capLimit?: number;
}): string {
  if (p.loading) return '…';
  if (p.matching === 0) {
    return p.total === 0 ? `No ${p.plural}` : `No ${p.plural} match (${p.total} total)`;
  }
  const lastPage = Math.max(1, Math.ceil(p.matching / p.pageSize));
  const page = Math.min(Math.max(1, p.page), lastPage);
  const from = (page - 1) * p.pageSize + 1;
  const to = Math.min(page * p.pageSize, p.matching);
  const notes: string[] = [];
  if (p.matching < p.total) notes.push(`${p.total} total`);
  if (p.capLimit !== undefined) notes.push(`newest ${p.capLimit} only`);
  const noun = p.matching === 1 ? p.singular : p.plural;
  return `Showing ${from}-${to} of ${p.matching} ${noun}${notes.length ? ` (${notes.join(', ')})` : ''}`;
}
