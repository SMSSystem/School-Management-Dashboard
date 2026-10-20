import { describe, expect, it } from 'vitest';
import {
  ALL_STUDENTS,
  DAY_OPTIONS,
  buildSubjectPayload,
  dailyDays,
  enrollmentClassesFor,
  enrollmentsByClass,
  formValuesFor,
  frequencyOf,
  schema,
  setEnrollmentType,
  toggleClassLists,
  toggleDayList,
  toggleExcludedStudent,
  type SubjectFormOutput,
} from '../subjectFormLogic';

// The subject form's rules that need no screen or database. Written when they were moved out of the form, so the
// move is pinned to what the form did.

const valid = {
  name: 'Mathematics',
  description: '',
  classScope: 'institution',
  classIds: [],
  classNames: [],
  teacherIds: [],
  teacherNames: [],
  cwWeight: 40,
  examWeight: 60,
  frequency: 'weekly',
  sessionDayOfWeek: [1, 3],
  fortnightlyOffset: 0,
};

const issues = (over: Record<string, unknown>) => {
  const result = schema.safeParse({ ...valid, ...over });
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('the subject form schema', () => {
  it('accepts a complete subject', () => {
    expect(issues({})).toEqual([]);
  });

  it('asks for a name of 2 to 100 characters', () => {
    expect(issues({ name: 'M' })).toEqual(['name: Name must be at least 2 characters.']);
    expect(issues({ name: 'Ma' })).toEqual([]);
    expect(issues({ name: 'x'.repeat(100) })).toEqual([]);
    expect(issues({ name: 'x'.repeat(101) })).toHaveLength(1);
  });

  it('limits the description to 500 characters', () => {
    expect(issues({ description: 'x'.repeat(500) })).toEqual([]);
    expect(issues({ description: 'x'.repeat(501) })).toHaveLength(1);
  });

  it('wants at least one class when the subject is for specific classes', () => {
    expect(issues({ classScope: 'class' })).toEqual(['classIds: Select at least one class.']);
    expect(issues({ classScope: 'class', classIds: ['c1'], classNames: ['1A'] })).toEqual([]);
    expect(issues({ classScope: 'institution', classIds: [] })).toEqual([]);
  });

  it('wants the two weights to add up to 100, and puts the message on the exam weight', () => {
    expect(issues({ cwWeight: 50, examWeight: 40 })).toEqual(['examWeight: Course Work and Exam weights must sum to 100.']);
    expect(issues({ cwWeight: 0, examWeight: 100 })).toEqual([]);
    expect(issues({ cwWeight: '70', examWeight: '30' })).toEqual([]);
    expect(issues({ cwWeight: 101, examWeight: -1 })).toHaveLength(2);
  });

  it('wants a day for a weekly or fortnightly subject, and none for a daily one', () => {
    expect(issues({ frequency: 'weekly', sessionDayOfWeek: [] })).toEqual(['sessionDayOfWeek: Select at least one day.']);
    expect(issues({ frequency: 'fortnightly', sessionDayOfWeek: [] })).toEqual(['sessionDayOfWeek: Select at least one day.']);
    expect(issues({ frequency: 'daily', sessionDayOfWeek: [] })).toEqual([]);
  });

  it('accepts a fortnightly offset of 0 or 1 only', () => {
    expect(issues({ fortnightlyOffset: 1 })).toEqual([]);
    expect(issues({ fortnightlyOffset: 2 })).toHaveLength(1);
    expect(issues({ fortnightlyOffset: undefined })).toEqual([]);
  });

  it('rejects an unknown frequency or class scope', () => {
    expect(issues({ frequency: 'monthly' })).toHaveLength(1);
    expect(issues({ classScope: 'house' })).toHaveLength(1);
  });
});

describe('DAY_OPTIONS', () => {
  it('is Monday to Saturday, without Sunday', () => {
    expect(DAY_OPTIONS.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  });
});

describe('frequencyOf and formValuesFor', () => {
  it('knows daily and fortnightly, and treats anything else as weekly', () => {
    expect(frequencyOf('daily')).toBe('daily');
    expect(frequencyOf('fortnightly')).toBe('fortnightly');
    expect(frequencyOf('weekly')).toBe('weekly');
    expect(frequencyOf('custom')).toBe('weekly');
    expect(frequencyOf(undefined)).toBe('weekly');
  });

  it('fills the edit form from the subject', () => {
    expect(
      formValuesFor({
        name: 'Maths',
        description: 'Numbers',
        classScope: 'class',
        classIds: ['c1'],
        classNames: ['1A'],
        teacherIds: ['t1'],
        teacherNames: ['Ms One'],
        cwWeight: 30,
        examWeight: 70,
        frequency: 'fortnightly',
        sessionDayOfWeek: [2, 4],
        fortnightlyOffset: 1,
      }),
    ).toEqual({
      name: 'Maths',
      description: 'Numbers',
      classScope: 'class',
      classIds: ['c1'],
      classNames: ['1A'],
      teacherIds: ['t1'],
      teacherNames: ['Ms One'],
      cwWeight: 30,
      examWeight: 70,
      frequency: 'fortnightly',
      sessionDayOfWeek: [2, 4],
      fortnightlyOffset: 1,
    });
  });

  it('defaults what a stored subject lacks: institution-wide, no teachers, weights 0, weekly, no days, offset 0', () => {
    expect(formValuesFor({ id: 's1' })).toEqual({
      name: '',
      description: '',
      classScope: 'institution',
      classIds: [],
      classNames: [],
      teacherIds: [],
      teacherNames: [],
      cwWeight: 0,
      examWeight: 0,
      frequency: 'weekly',
      sessionDayOfWeek: [],
      fortnightlyOffset: 0,
    });
  });
});

describe('dailyDays and toggleDayList', () => {
  it('gives Monday to Friday, and Saturday too when it is included', () => {
    expect(dailyDays(false)).toEqual([1, 2, 3, 4, 5]);
    expect(dailyDays(true)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('adds a day in week order and removes one that is there', () => {
    expect(toggleDayList([1, 5], 3)).toEqual([1, 3, 5]);
    expect(toggleDayList([], 4)).toEqual([4]);
    expect(toggleDayList([1, 3, 5], 3)).toEqual([1, 5]);
  });
});

describe('toggleClassLists', () => {
  it('adds a class to both lists, and removes it from both', () => {
    const added = toggleClassLists(['c1'], ['1A'], 'c2', '1B');
    expect(added).toEqual({ ids: ['c1', 'c2'], names: ['1A', '1B'] });
    expect(toggleClassLists(added.ids, added.names, 'c1', '1A')).toEqual({ ids: ['c2'], names: ['1B'] });
  });
});

describe('enrollmentsByClass', () => {
  it('turns the stored enrolments into one choice per class', () => {
    expect(
      enrollmentsByClass([
        { classId: 'c1', enrollmentType: 'all' },
        { classId: 'c2', enrollmentType: 'selective', excludedStudentIds: ['u1'], excludedStudentNames: ['Ann'] },
      ]),
    ).toEqual({
      c1: { type: 'all', excludedIds: [], excludedNames: [] },
      c2: { type: 'selective', excludedIds: ['u1'], excludedNames: ['Ann'] },
    });
    expect(enrollmentsByClass([])).toEqual({});
  });
});

describe('the enrolment edits', () => {
  it('a class with no choice enrols everyone', () => {
    expect(ALL_STUDENTS).toEqual({ type: 'all', excludedIds: [], excludedNames: [] });
  });

  it('switching a class between all and selective clears its exclusions and leaves the other classes alone', () => {
    const prev = {
      c1: { type: 'selective' as const, excludedIds: ['u1'], excludedNames: ['Ann'] },
      c2: { type: 'all' as const, excludedIds: [], excludedNames: [] },
    };
    expect(setEnrollmentType(prev, 'c1', 'all').c1).toEqual({ type: 'all', excludedIds: [], excludedNames: [] });
    expect(setEnrollmentType(prev, 'c1', 'selective').c1).toEqual({ type: 'selective', excludedIds: [], excludedNames: [] });
    expect(setEnrollmentType(prev, 'c3', 'selective').c2).toBe(prev.c2);
    expect(prev.c1.excludedIds).toEqual(['u1']);
  });

  it('excludes a student with their name in step, and includes them again', () => {
    const ann = { uid: 'u1', name: 'Ann' };
    const bob = { uid: 'u2', name: 'Bob' };
    const one = toggleExcludedStudent({}, 'c1', ann, false);
    expect(one.c1).toEqual({ type: 'selective', excludedIds: ['u1'], excludedNames: ['Ann'] });
    const two = toggleExcludedStudent(one, 'c1', bob, false);
    expect(two.c1).toEqual({ type: 'selective', excludedIds: ['u1', 'u2'], excludedNames: ['Ann', 'Bob'] });
    expect(toggleExcludedStudent(two, 'c1', ann, true).c1).toEqual({ type: 'selective', excludedIds: ['u2'], excludedNames: ['Bob'] });
  });
});

describe('enrollmentClassesFor', () => {
  const live = [{ id: 'c1', name: '1A' }, { id: 'c2', name: '1B' }, { id: 'c3', name: '1C' }];

  it('is every class for an institution-wide subject', () => {
    expect(enrollmentClassesFor('institution', ['c1'], ['1A'], live)).toBe(live);
  });

  it('is the ticked classes, with their names by position, for a class-scoped subject', () => {
    expect(enrollmentClassesFor('class', ['c3', 'c1'], ['1C', '1A'], live)).toEqual([
      { id: 'c3', name: '1C' },
      { id: 'c1', name: '1A' },
    ]);
    expect(enrollmentClassesFor('class', [], [], live)).toEqual([]);
  });
});

describe('buildSubjectPayload', () => {
  const formData = {
    ...valid,
    description: undefined,
    classScope: 'class',
    classIds: ['c1'],
    classNames: ['1A'],
    teacherIds: ['t1'],
    teacherNames: ['Ms One'],
    frequency: 'fortnightly',
    sessionDayOfWeek: [2],
  } as unknown as SubjectFormOutput;

  it('builds the subject’s document, with an empty description when none was typed', () => {
    expect(buildSubjectPayload({ formData, institutionId: 'i1', fortnightlyOffset: 1 })).toEqual({
      name: 'Mathematics',
      description: '',
      institutionId: 'i1',
      classScope: 'class',
      classIds: ['c1'],
      classNames: ['1A'],
      teacherIds: ['t1'],
      teacherNames: ['Ms One'],
      cwWeight: 40,
      examWeight: 60,
      frequency: 'fortnightly',
      sessionDayOfWeek: [2],
      fortnightlyOffset: 1,
    });
  });

  it('empties the class lists for an institution-wide subject, whatever was ticked before', () => {
    const p = buildSubjectPayload({ formData: { ...formData, classScope: 'institution' }, institutionId: 'i1', fortnightlyOffset: 0 });
    expect(p.classIds).toEqual([]);
    expect(p.classNames).toEqual([]);
  });

  it('keeps the fortnightly offset only for a fortnightly subject', () => {
    expect(buildSubjectPayload({ formData: { ...formData, frequency: 'weekly' }, institutionId: 'i1', fortnightlyOffset: 1 }).fortnightlyOffset).toBeUndefined();
    expect(buildSubjectPayload({ formData: { ...formData, frequency: 'daily' }, institutionId: 'i1', fortnightlyOffset: 1 }).fortnightlyOffset).toBeUndefined();
  });
});
