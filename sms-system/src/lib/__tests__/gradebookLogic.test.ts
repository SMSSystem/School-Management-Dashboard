import { describe, expect, it } from 'vitest';
import {
  affectedCountOf,
  averageOf,
  commentNumbersOf,
  conductOf,
  effectiveColumnsOf,
  gradebookIdOf,
  hasScoreError,
  isDirtyOf,
  scoreOf,
  sharedTeacherNamesOf,
  subjectsForRole,
  visibleClassesFor,
  visibleSubjectsFor,
  weightTotalOf,
  type ColumnDoc,
  type FeedbackDoc,
  type ResultDoc,
  type SubjectDoc,
} from '../gradebookLogic';

// The Gradebook page's rules that need no screen or database. Written when they were moved out of the
// page, so the move is pinned to the behaviour they had.

const col = (id: string, over: Partial<ColumnDoc> = {}): ColumnDoc =>
  ({ id, label: id, assessmentType: 'coursework', maxScore: 100, columnWeight: 50, order: 1, ...over }) as ColumnDoc;

const result = (studentId: string, colId: string, score: number): ResultDoc =>
  ({ id: `${studentId}_${colId}`, studentId, gradebookColumnId: colId, score }) as unknown as ResultDoc;

describe('columns', () => {
  it('applies unsaved edits to a column and sorts by order', () => {
    const columns = [col('b', { order: 2, label: 'Quiz' }), col('a', { order: 1 })];
    const effective = effectiveColumnsOf(columns, { b: { label: 'Test', maxScore: 20 } });
    expect(effective.map((c) => c.id)).toEqual(['a', 'b']);
    expect(effective[1]).toMatchObject({ label: 'Test', maxScore: 20, columnWeight: 50 });
    expect(columns[0].label).toBe('Quiz'); // the saved column is not changed
  });

  it('adds up the column weights, treating a missing weight as 0', () => {
    expect(weightTotalOf([col('a', { columnWeight: 40 }), col('b', { columnWeight: 60 })])).toBe(100);
    expect(weightTotalOf([col('a', { columnWeight: undefined as never })])).toBe(0);
    expect(weightTotalOf([])).toBe(0);
  });
});

describe('isDirtyOf', () => {
  const clean = { dirtyScores: {}, dirtyConduct: {}, dirtyComments: {}, pendingColumnEdits: {} };

  it('is false with nothing unsaved and true when any one of the four holds something', () => {
    expect(isDirtyOf(clean)).toBe(false);
    expect(isDirtyOf({ ...clean, dirtyScores: { s1: { a: 5 } } })).toBe(true);
    expect(isDirtyOf({ ...clean, dirtyConduct: { s1: 'G' } })).toBe(true);
    expect(isDirtyOf({ ...clean, dirtyComments: { s1: [1] } })).toBe(true);
    expect(isDirtyOf({ ...clean, pendingColumnEdits: { a: { label: 'x' } } })).toBe(true);
  });
});

describe('what a cell holds', () => {
  const results = [result('s1', 'a', 70)];
  const feedback: FeedbackDoc[] = [{ id: 'f1', studentId: 's1', conductGrade: 'S', commentNumbers: [2, 4] }];

  it('shows the unsaved score before the saved one, and blank when there is neither', () => {
    expect(scoreOf({}, results, 's1', 'a')).toBe(70);
    expect(scoreOf({ s1: { a: 85 } }, results, 's1', 'a')).toBe(85);
    expect(scoreOf({ s1: { a: '' } }, results, 's1', 'a')).toBe(''); // a cleared cell stays cleared
    expect(scoreOf({}, results, 's1', 'b')).toBe('');
    expect(scoreOf({}, results, 's2', 'a')).toBe('');
  });

  it('shows the unsaved conduct grade and comments before the saved ones', () => {
    expect(conductOf({}, feedback, 's1')).toBe('S');
    expect(conductOf({ s1: 'G' }, feedback, 's1')).toBe('G');
    expect(conductOf({}, feedback, 's2')).toBe('');
    expect(commentNumbersOf({}, feedback, 's1')).toEqual([2, 4]);
    expect(commentNumbersOf({ s1: [] }, feedback, 's1')).toEqual([]);
    expect(commentNumbersOf({}, feedback, 's2')).toEqual([]);
  });

  it('flags only an unsaved score above the column maximum', () => {
    expect(hasScoreError({ s1: { a: 101 } }, 's1', 'a', 100)).toBe(true);
    expect(hasScoreError({ s1: { a: 100 } }, 's1', 'a', 100)).toBe(false);
    expect(hasScoreError({ s1: { a: '' } }, 's1', 'a', 100)).toBe(false);
    expect(hasScoreError({}, 's1', 'a', 100)).toBe(false);
  });

  it('counts the saved results above zero in a column', () => {
    expect(affectedCountOf([result('s1', 'a', 70), result('s2', 'a', 0), result('s3', 'b', 50)], 'a')).toBe(1);
  });
});

describe('averageOf', () => {
  const two = [col('a', { maxScore: 50, columnWeight: 40 }), col('b', { maxScore: 100, columnWeight: 60 })];
  const scores = (m: Record<string, number | ''>) => (_: string, colId: string) => m[colId] ?? '';

  it('weights each column by its share and rounds to a whole percent', () => {
    // a: 25/50 = 50% of 40 -> 20; b: 80/100 = 80% of 60 -> 48; total 68
    expect(averageOf(two, scores({ a: 25, b: 80 }), 's1')).toBe(68);
    expect(averageOf(two, scores({ a: 33, b: 77 }), 's1')).toBe(Math.round(((33 / 50) * 40 + (77 / 100) * 60)));
  });

  it('counts a blank cell as 0', () => {
    expect(averageOf(two, scores({ a: 50 }), 's1')).toBe(40);
  });

  it('is 0 with fewer than two columns, with no weights, and a zero maximum counts as 1', () => {
    expect(averageOf([two[0]], scores({ a: 25 }), 's1')).toBe(0);
    expect(averageOf([col('a', { columnWeight: 0 }), col('b', { columnWeight: 0 })], scores({ a: 5 }), 's1')).toBe(0);
    const zeroMax = [col('a', { maxScore: 0, columnWeight: 50 }), col('b', { maxScore: 100, columnWeight: 50 })];
    expect(averageOf(zeroMax, scores({ a: 1, b: 100 }), 's1')).toBe(100); // 1/1 of 50 + 100/100 of 50
  });
});

const subjects: SubjectDoc[] = [
  { id: 'math', name: 'Math', classIds: ['c1'], teacherIds: ['t1'] },
  { id: 'art', name: 'Art', classIds: ['c2'], teacherIds: ['t2', 't1'], teacherNames: ['Ms Two', 'Mr One'] },
  { id: 'pe', name: 'PE', classScope: 'institution', teacherIds: ['t2'] },
];
const classes = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];

describe('subjectsForRole', () => {
  it('narrows only a senior teacher, to the subjects they teach', () => {
    expect(subjectsForRole(subjects, 'senior_teacher', 't1').map((s) => s.id)).toEqual(['math', 'art']);
    expect(subjectsForRole(subjects, 'regular_teacher', 't1')).toBe(subjects);
    expect(subjectsForRole(subjects, 'institution_admin', 'a1')).toBe(subjects);
  });
});

describe('visibleClassesFor', () => {
  const base = { classes, subjects, uid: 't1', assignedClassId: null };

  it('shows an admin every class', () => {
    expect(visibleClassesFor({ ...base, role: 'institution_admin' })).toBe(classes);
    expect(visibleClassesFor({ ...base, role: 'spectator' })).toBe(classes);
  });

  it('shows a senior teacher only their homeroom class, and none until it is known', () => {
    expect(visibleClassesFor({ ...base, role: 'senior_teacher', assignedClassId: 'c2' }).map((c) => c.id)).toEqual(['c2']);
    expect(visibleClassesFor({ ...base, role: 'senior_teacher' })).toEqual([]);
  });

  it('shows a regular teacher the classes of the subjects they teach', () => {
    expect(visibleClassesFor({ ...base, role: 'regular_teacher' }).map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(visibleClassesFor({ ...base, role: 'regular_teacher', uid: 'nobody' })).toEqual([]);
  });
});

describe('visibleSubjectsFor', () => {
  it('shows nothing until a class is chosen', () => {
    expect(visibleSubjectsFor({ subjects, selectedClassId: '', role: 'institution_admin', uid: 'a1' })).toEqual([]);
  });

  it('shows an admin the subjects of the class and every institution-wide one', () => {
    expect(visibleSubjectsFor({ subjects, selectedClassId: 'c1', role: 'institution_admin', uid: 'a1' }).map((s) => s.id)).toEqual(['math', 'pe']);
    expect(visibleSubjectsFor({ subjects, selectedClassId: 'c3', role: 'institution_admin', uid: 'a1' }).map((s) => s.id)).toEqual(['pe']);
  });

  it('narrows a teacher to the subjects they teach', () => {
    expect(visibleSubjectsFor({ subjects, selectedClassId: 'c1', role: 'regular_teacher', uid: 't1' }).map((s) => s.id)).toEqual(['math']);
    expect(visibleSubjectsFor({ subjects, selectedClassId: 'c1', role: 'senior_teacher', uid: 't2' }).map((s) => s.id)).toEqual(['pe']);
  });
});

describe('sharedTeacherNamesOf', () => {
  const art = subjects[1];

  it('is empty for a subject with fewer than two teachers or none chosen', () => {
    expect(sharedTeacherNamesOf(subjects[0], 'regular_teacher', 't1')).toEqual([]);
    expect(sharedTeacherNamesOf(undefined, 'regular_teacher', 't1')).toEqual([]);
  });

  it('names the other teachers for a teacher, and every teacher for an admin', () => {
    expect(sharedTeacherNamesOf(art, 'regular_teacher', 't1')).toEqual(['Ms Two']);
    expect(sharedTeacherNamesOf(art, 'institution_admin', 'a1')).toEqual(['Ms Two', 'Mr One']);
    expect(sharedTeacherNamesOf(art, 'super_admin', undefined)).toEqual(['Ms Two', 'Mr One']);
  });

  it('falls back to the id when a name is missing', () => {
    expect(sharedTeacherNamesOf({ ...art, teacherNames: undefined }, 'institution_admin', 'a1')).toEqual(['t2', 't1']);
  });
});

describe('gradebookIdOf', () => {
  it('joins class, subject and term, and is null until all three are chosen', () => {
    expect(gradebookIdOf('c1', 'math', 'term1')).toBe('c1_math_term1');
    expect(gradebookIdOf('c1', 'math', '')).toBeNull();
    expect(gradebookIdOf('', 'math', 'term1')).toBeNull();
    expect(gradebookIdOf('c1', '', 'term1')).toBeNull();
  });
});
