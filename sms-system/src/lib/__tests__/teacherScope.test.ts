import { describe, it, expect } from 'vitest';
import { classesTaughtBy, classOptionsFor, subjectsTaughtBy } from '../teacherScope';

const classes = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];

const subjects = [
  { id: 's1', teacherIds: ['t1'], classIds: ['c1'], classScope: 'class' },
  { id: 's2', teacherIds: ['t1', 't2'], classIds: ['c2'], classScope: 'class' },
  { id: 's3', teacherIds: ['t2'], classIds: [], classScope: 'institution' },
];

describe('subjectsTaughtBy', () => {
  it('returns only subjects whose teacherIds include the uid', () => {
    expect(subjectsTaughtBy(subjects, 't1').map((s) => s.id)).toEqual(['s1', 's2']);
    expect(subjectsTaughtBy(subjects, 'nobody')).toEqual([]);
  });
});

describe('classesTaughtBy', () => {
  it('unions the class lists of the subjects taught', () => {
    expect(classesTaughtBy(classes, subjects, 't1').map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('returns every class when a taught subject is institution-wide', () => {
    expect(classesTaughtBy(classes, subjects, 't2')).toEqual(classes);
  });

  it('returns nothing for a teacher with no subjects', () => {
    expect(classesTaughtBy(classes, subjects, 'nobody')).toEqual([]);
  });
});

describe('classOptionsFor', () => {
  const taught = classesTaughtBy(classes, subjects, 't1');

  it('falls back to every taught class when no subject is chosen', () => {
    expect(classOptionsFor(undefined, taught)).toEqual(taught);
  });

  it('narrows to the chosen subject’s classes', () => {
    expect(classOptionsFor(subjects[0], taught).map((c) => c.id)).toEqual(['c1']);
  });

  it('keeps all taught classes for an institution-wide subject', () => {
    expect(classOptionsFor(subjects[2], taught)).toEqual(taught);
  });
});
