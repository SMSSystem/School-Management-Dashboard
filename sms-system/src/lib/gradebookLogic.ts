import type { GradebookColumnDocument, ResultDocument } from '@/types/assessment';
import type { Role } from '@/types/people';

// The Gradebook page's rules that need no screen or database (scenes/(dashboard)/list/gradebook): which
// columns and totals the grid shows, which score, conduct grade and comments a cell holds (unsaved edit
// before saved value), the weighted average, and which classes and subjects a role may pick.

export type SubjectDoc = {
  id: string;
  name: string;
  classIds?: string[];
  classScope?: string;
  teacherIds?: string[];
  teacherNames?: string[];
  assistantTeacherId?: string;
  departmentId?: string;
};
export type StudentDoc = { id: string; name: string; gender?: string };
// The full ResultDocument shape (the page only reads a few of its fields — student/class/subject names are
// resolved separately from the students and classes it loads, joined by ID).
export type ResultDoc = ResultDocument & { id: string };
export type FeedbackDoc = {
  id: string;
  studentId: string;
  conductGrade?: string;
  commentNumbers?: number[];
};
export type ColumnDoc = GradebookColumnDocument & { id: string };

export type DirtyScores = Record<string, Record<string, number | ''>>;

/** The columns with any unsaved edits applied, in column order. */
export function effectiveColumnsOf(
  columns: ColumnDoc[],
  pendingColumnEdits: Record<string, Partial<GradebookColumnDocument>>,
): ColumnDoc[] {
  return columns
    .map((col) => ({ ...col, ...(pendingColumnEdits[col.id] ?? {}) }))
    .sort((a, b) => a.order - b.order);
}

export function weightTotalOf(effectiveColumns: ColumnDoc[]): number {
  return effectiveColumns.reduce((s, c) => s + (c.columnWeight ?? 0), 0);
}

/** Anything unsaved: a score, a conduct grade, a comment choice or a column edit. */
export function isDirtyOf(state: {
  dirtyScores: DirtyScores;
  dirtyConduct: Record<string, string>;
  dirtyComments: Record<string, number[]>;
  pendingColumnEdits: Record<string, Partial<GradebookColumnDocument>>;
}): boolean {
  return (
    Object.keys(state.dirtyScores).length > 0 ||
    Object.keys(state.dirtyConduct).length > 0 ||
    Object.keys(state.dirtyComments).length > 0 ||
    Object.keys(state.pendingColumnEdits).length > 0
  );
}

/** A cell's score: the unsaved edit if there is one, else the saved result, else blank. */
export function scoreOf(dirtyScores: DirtyScores, results: ResultDoc[], studentId: string, colId: string): number | '' {
  const dirty = dirtyScores[studentId]?.[colId];
  if (dirty !== undefined) return dirty;
  const saved = results.find((r) => r.gradebookColumnId === colId && r.studentId === studentId);
  return saved?.score ?? '';
}

export function conductOf(dirtyConduct: Record<string, string>, feedback: FeedbackDoc[], studentId: string): string {
  if (dirtyConduct[studentId] !== undefined) return dirtyConduct[studentId];
  return feedback.find((f) => f.studentId === studentId)?.conductGrade ?? '';
}

export function commentNumbersOf(
  dirtyComments: Record<string, number[]>,
  feedback: FeedbackDoc[],
  studentId: string,
): number[] {
  if (dirtyComments[studentId] !== undefined) return dirtyComments[studentId];
  return feedback.find((f) => f.studentId === studentId)?.commentNumbers ?? [];
}

/** An unsaved score above its column's maximum. */
export function hasScoreError(dirtyScores: DirtyScores, studentId: string, colId: string, maxScore: number): boolean {
  const dirty = dirtyScores[studentId]?.[colId];
  return dirty !== undefined && dirty !== '' && Number(dirty) > maxScore;
}

/** A student's weighted average as a whole percent; 0 with fewer than two columns or no weights. */
export function averageOf(
  effectiveColumns: ColumnDoc[],
  getScore: (studentId: string, colId: string) => number | '',
  studentId: string,
): number {
  if (effectiveColumns.length < 2) return 0;
  const weightSum = effectiveColumns.reduce((s, c) => s + (c.columnWeight ?? 0), 0);
  if (weightSum === 0) return 0;
  const scoreSum = effectiveColumns.reduce((s, col) => {
    const score = getScore(studentId, col.id);
    const num = score === '' ? 0 : Number(score);
    const maxScore = col.maxScore > 0 ? col.maxScore : 1;
    return s + (num / maxScore) * (col.columnWeight ?? 0);
  }, 0);
  return Math.round((scoreSum / weightSum) * 100);
}

/** How many saved results a column edit or delete would touch. */
export function affectedCountOf(results: ResultDoc[], colId: string): number {
  return results.filter((r) => r.gradebookColumnId === colId && r.score > 0).length;
}

/** A senior teacher sees the subjects they teach (the page narrows this client-side, as a rule never did). */
export function subjectsForRole<S extends { teacherIds?: string[] }>(rawSubjects: S[], role: Role | null, uid: string): S[] {
  return role === 'senior_teacher' ? rawSubjects.filter((s) => s.teacherIds?.includes(uid)) : rawSubjects;
}

/** The classes a role may pick: a senior teacher their own, a regular teacher those of their subjects. */
export function visibleClassesFor<C extends { id: string }>({
  classes,
  subjects,
  role,
  uid,
  assignedClassId,
}: {
  classes: C[];
  subjects: SubjectDoc[];
  role: Role | null;
  uid: string;
  assignedClassId: string | null;
}): C[] {
  if (role === 'senior_teacher') {
    return assignedClassId ? classes.filter((c) => c.id === assignedClassId) : [];
  }
  if (role === 'regular_teacher') {
    const teacherClassIds = new Set<string>();
    subjects.forEach((s) => {
      if (s.teacherIds?.includes(uid)) {
        s.classIds?.forEach((cid) => teacherClassIds.add(cid));
      }
    });
    return classes.filter((c) => teacherClassIds.has(c.id));
  }
  return classes;
}

/** The subjects for the chosen class (an institution-wide subject is for every class), narrowed for a teacher. */
export function visibleSubjectsFor({
  subjects,
  selectedClassId,
  role,
  uid,
}: {
  subjects: SubjectDoc[];
  selectedClassId: string;
  role: Role | null;
  uid: string;
}): SubjectDoc[] {
  if (!selectedClassId) return [];
  const forClass = subjects.filter(
    (s) => s.classScope === 'institution' || s.classIds?.includes(selectedClassId),
  );
  if (role === 'regular_teacher' || role === 'senior_teacher') {
    return forClass.filter((s) => s.teacherIds?.includes(uid));
  }
  return forClass;
}

/** The other teachers a subject's gradebook is shared with, for the banner (an admin sees them all). */
export function sharedTeacherNamesOf(subject: SubjectDoc | undefined, role: Role | null, uid: string | undefined): string[] {
  if (!subject?.teacherIds || subject.teacherIds.length < 2) return [];
  return subject.teacherIds
    .map((tid, i) => ({
      tid,
      name: subject.teacherNames?.[i] ?? tid,
    }))
    .filter(({ tid }) => (role === 'institution_admin' || role === 'super_admin' ? true : tid !== uid))
    .map(({ name }) => name);
}

/** The id a gradebook document goes by, or null until a class, subject and term are all chosen. */
export function gradebookIdOf(classId: string, subjectId: string, termId: string): string | null {
  return classId && subjectId && termId ? `${classId}_${subjectId}_${termId}` : null;
}
