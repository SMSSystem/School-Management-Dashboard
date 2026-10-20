// What a teacher "teaches", derived from subject documents (subjects.teacherIds /
// classIds / classScope). Used to filter the Lesson Notes class and subject
// pickers to what the teacher actually teaches, and, through
// subjectTeachesAllClasses, by the Gradebook's class picker (lib/gradebookLogic.ts).
// UI-level only: firestore.rules does not enforce it.

export type TeachableSubject = {
  id: string;
  teacherIds?: string[];
  classIds?: string[];
  classScope?: string;
};

export function subjectsTaughtBy<S extends TeachableSubject>(subjects: S[], uid: string): S[] {
  return subjects.filter((s) => s.teacherIds?.includes(uid));
}

// A subject with classScope 'institution' (or no class list) is taught to
// every class, so a teacher of it may pick any class.
export function subjectTeachesAllClasses(s: TeachableSubject): boolean {
  return s.classScope === 'institution' || !s.classIds || s.classIds.length === 0;
}

export function classesTaughtBy<C extends { id: string }, S extends TeachableSubject>(
  classes: C[],
  subjects: S[],
  uid: string,
): C[] {
  const taught = subjectsTaughtBy(subjects, uid);
  if (taught.some(subjectTeachesAllClasses)) return classes;
  const ids = new Set(taught.flatMap((s) => s.classIds ?? []));
  return classes.filter((c) => ids.has(c.id));
}

// Classes selectable for one chosen subject, narrowed to what the teacher
// teaches. With no subject chosen, falls back to every class they teach.
export function classOptionsFor<C extends { id: string }, S extends TeachableSubject>(
  subject: S | undefined,
  taughtClasses: C[],
): C[] {
  if (!subject) return taughtClasses;
  if (subjectTeachesAllClasses(subject)) return taughtClasses;
  const ids = new Set(subject.classIds);
  return taughtClasses.filter((c) => ids.has(c.id));
}
