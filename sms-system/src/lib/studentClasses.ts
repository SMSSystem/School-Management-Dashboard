// A student's classes. `classId` is the HOME class (optional): the report card, the general attendance
// register, school-wide counts and class rank use it. `classIds` lists EVERY class the student is in, home
// included, so one `array-contains` query finds a class's whole roster. A student can be in further
// classes ("extra" classes); for each, `classSubjects` may list the subject ids the student takes there.
// A class missing from `classSubjects` means every subject of that class (the default).
//
// Invariants, kept by normaliseMembership() and by every writer:
//   - extra classes need a home class;
//   - `classIds` contains the home class (first) and never repeats a class;
//   - `classSubjects` has keys for extra classes only, and never an empty list.
// No Firebase import: cheap to unit-test and to use from forms, the import and the backfill.

export type ClassMembership = {
  classId?: string | null;
  classIds?: string[] | null;
  classSubjects?: Record<string, string[]> | null;
};

const asId = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Every class of a student, home first. Reads `[classId]` when `classIds` is not stored yet. */
export function classIdsOf(s: ClassMembership | null | undefined): string[] {
  if (!s) return [];
  const home = asId(s.classId);
  const stored = Array.isArray(s.classIds) ? s.classIds.map(asId).filter(Boolean) : [];
  const all = [...(home ? [home] : []), ...stored];
  return [...new Set(all)];
}

/** The classes besides the home class. */
export function extraClassIds(s: ClassMembership | null | undefined): string[] {
  const home = asId(s?.classId);
  return classIdsOf(s).filter((id) => id !== home);
}

export type StoredMembership = { classId: string | null; classIds: string[]; classSubjects: Record<string, string[]> };

/**
 * What an admin picked (home class, extra classes, chosen subjects per extra class) -> the three stored
 * fields. Without a home class there are no extras. `knownClassIds`, when given, drops ids that are not
 * classes of the institution. An empty subject list is dropped (it would mean "no subject at all"; the
 * forms ask for at least one chosen subject instead).
 */
export function normaliseMembership(
  pick: { classId?: string | null; extraClassIds?: string[]; classSubjects?: Record<string, string[] | undefined> },
  knownClassIds?: ReadonlySet<string>,
): StoredMembership {
  const home = asId(pick.classId);
  if (!home) return { classId: null, classIds: [], classSubjects: {} };
  const extras = [...new Set((pick.extraClassIds ?? []).map(asId).filter(Boolean))].filter(
    (id) => id !== home && (!knownClassIds || knownClassIds.has(id)),
  );
  const classSubjects: Record<string, string[]> = {};
  for (const id of extras) {
    const subjects = [...new Set((pick.classSubjects?.[id] ?? []).map(asId).filter(Boolean))];
    if (subjects.length > 0) classSubjects[id] = subjects;
  }
  return { classId: home, classIds: [home, ...extras], classSubjects };
}

/** True when the student is in the class, at home or as an extra. */
export function isInClass(s: ClassMembership | null | undefined, classId: string): boolean {
  return !!classId && classIdsOf(s).includes(classId);
}

/**
 * Does the student take this subject in this class? The home class always gives every subject; an extra
 * class gives every subject unless `classSubjects` lists chosen ones.
 */
export function takesSubject(s: ClassMembership | null | undefined, classId: string, subjectId: string): boolean {
  if (!isInClass(s, classId)) return false;
  if (asId(s?.classId) === classId) return true;
  const chosen = s?.classSubjects?.[classId];
  return !Array.isArray(chosen) || chosen.length === 0 || chosen.includes(subjectId);
}

/** The student without one extra class (the home class is not removed this way). */
export function withoutExtraClass(s: ClassMembership, classId: string): StoredMembership {
  const home = asId(s.classId);
  if (!home || classId === home) {
    return { classId: home || null, classIds: classIdsOf(s), classSubjects: { ...(s.classSubjects ?? {}) } };
  }
  const classSubjects = { ...(s.classSubjects ?? {}) };
  delete classSubjects[classId];
  return { classId: home, classIds: classIdsOf(s).filter((id) => id !== classId), classSubjects };
}

/** The student with one more extra class (all subjects unless `subjects` is given). */
export function withExtraClass(s: ClassMembership, classId: string, subjects?: string[]): StoredMembership {
  return normaliseMembership({
    classId: s.classId,
    extraClassIds: [...extraClassIds(s), classId],
    classSubjects: { ...(s.classSubjects ?? {}), ...(subjects?.length ? { [classId]: subjects } : {}) },
  });
}

/**
 * What is wrong with an admin's pick, in words for the form, or '' when it is fine. Extra classes need a
 * home class, and a class set to "chosen subjects" needs at least one subject (an empty list would mean
 * the student takes nothing there). `classSubjects[id]` being an array, even an empty one, is the
 * "chosen subjects" mode while the form is being edited.
 */
export function membershipError(pick: {
  classId?: string | null;
  extraClassIds?: string[];
  classSubjects?: Record<string, string[] | undefined>;
}): string {
  const extras = (pick.extraClassIds ?? []).filter(Boolean);
  if (extras.length === 0) return '';
  if (!asId(pick.classId)) return 'Choose a class before adding additional classes.';
  const empty = extras.find((id) => Array.isArray(pick.classSubjects?.[id]) && pick.classSubjects![id]!.length === 0);
  if (empty) return 'Choose at least one subject for each class set to "Chosen subjects", or switch it to "All subjects".';
  return '';
}

/**
 * `classSubjects` as an edit form receives it: the stored map, or the same map as JSON text (the students
 * list hands rows to the form as strings and string lists only). Anything else is "no chosen subjects".
 */
export function readClassSubjects(value: unknown): Record<string, string[]> {
  let v = value;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, string[]> = {};
  for (const [classId, subjects] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(subjects)) out[classId] = subjects.filter((s): s is string => typeof s === 'string');
  }
  return out;
}

/**
 * The students of a class who take one subject there, for a subject's register, gradebook or assignment
 * roster: those in the class (home or additional) whose chosen subjects, if they have a list for this
 * class, include the subject, and who are not on the subject's excluded list for the class
 * (lib/subjectEnrollments.ts). `students` come from the query on `classIds`, so each is in the class.
 */
export function studentsTakingSubject<T extends ClassMembership & { uid: string }>(
  students: T[],
  classId: string,
  subjectId: string,
  excludedStudentIds: readonly string[] = [],
): T[] {
  const excluded = new Set(excludedStudentIds);
  return students.filter((s) => !excluded.has(s.uid) && takesSubject(s, classId, subjectId));
}
