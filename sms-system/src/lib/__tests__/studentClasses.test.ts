import { describe, expect, it } from 'vitest';
import {
  classIdsOf,
  extraClassIds,
  isInClass,
  membershipError,
  normaliseMembership,
  readClassSubjects,
  studentsTakingSubject,
  takesSubject,
  withExtraClass,
  withoutExtraClass,
} from '../studentClasses';

describe('classIdsOf / extraClassIds', () => {
  it('reads the home class alone when classIds is not stored yet', () => {
    expect(classIdsOf({ classId: 'a' })).toEqual(['a']);
    expect(extraClassIds({ classId: 'a' })).toEqual([]);
  });

  it('lists the home class first and never repeats a class', () => {
    expect(classIdsOf({ classId: 'a', classIds: ['b', 'a', 'c', 'b'] })).toEqual(['a', 'b', 'c']);
    expect(extraClassIds({ classId: 'a', classIds: ['b', 'a', 'c', 'b'] })).toEqual(['b', 'c']);
  });

  it('is empty for no class, null, or a student with nothing stored', () => {
    expect(classIdsOf(null)).toEqual([]);
    expect(classIdsOf({ classId: null, classIds: [] })).toEqual([]);
    expect(classIdsOf({})).toEqual([]);
  });

  it('ignores values that are not strings', () => {
    expect(classIdsOf({ classId: 'a', classIds: ['b', 7 as unknown as string, ''] })).toEqual(['a', 'b']);
  });
});

describe('normaliseMembership', () => {
  it('stores the home class first, then the extras, and keeps chosen subjects of extras only', () => {
    expect(
      normaliseMembership({
        classId: 'a',
        extraClassIds: ['b', 'c'],
        classSubjects: { b: ['maths', 'maths', 'art'], a: ['x'], zz: ['y'] },
      }),
    ).toEqual({ classId: 'a', classIds: ['a', 'b', 'c'], classSubjects: { b: ['maths', 'art'] } });
  });

  it('has no extras without a home class', () => {
    expect(normaliseMembership({ classId: '', extraClassIds: ['b'] })).toEqual({ classId: null, classIds: [], classSubjects: {} });
    expect(normaliseMembership({ extraClassIds: ['b'] }).classIds).toEqual([]);
  });

  it('never lists the home class again as an extra, and drops duplicates', () => {
    expect(normaliseMembership({ classId: 'a', extraClassIds: ['a', 'b', 'b'] }).classIds).toEqual(['a', 'b']);
  });

  it('drops an empty subject list (that would mean no subject at all) so the class means all subjects', () => {
    expect(normaliseMembership({ classId: 'a', extraClassIds: ['b'], classSubjects: { b: [] } }).classSubjects).toEqual({});
  });

  it('drops classes that do not exist when the known classes are given', () => {
    expect(normaliseMembership({ classId: 'a', extraClassIds: ['b', 'gone'] }, new Set(['a', 'b'])).classIds).toEqual(['a', 'b']);
  });
});

describe('takesSubject', () => {
  const student = { classId: 'a', classIds: ['a', 'b', 'c'], classSubjects: { b: ['maths'] } };

  it('gives every subject of the home class', () => {
    expect(takesSubject(student, 'a', 'anything')).toBe(true);
  });

  it('gives every subject of an extra class with no chosen list', () => {
    expect(takesSubject(student, 'c', 'anything')).toBe(true);
  });

  it('gives only the chosen subjects of an extra class with a list', () => {
    expect(takesSubject(student, 'b', 'maths')).toBe(true);
    expect(takesSubject(student, 'b', 'art')).toBe(false);
  });

  it('gives nothing of a class the student is not in', () => {
    expect(takesSubject(student, 'z', 'maths')).toBe(false);
    expect(takesSubject(null, 'a', 'maths')).toBe(false);
  });
});

describe('isInClass', () => {
  it('is true for the home class and extras, false otherwise', () => {
    const s = { classId: 'a', classIds: ['a', 'b'] };
    expect([isInClass(s, 'a'), isInClass(s, 'b'), isInClass(s, 'c'), isInClass(s, '')]).toEqual([true, true, false, false]);
  });
});

describe('withExtraClass / withoutExtraClass', () => {
  it('adds an extra class with all subjects, or with chosen ones', () => {
    expect(withExtraClass({ classId: 'a' }, 'b')).toEqual({ classId: 'a', classIds: ['a', 'b'], classSubjects: {} });
    expect(withExtraClass({ classId: 'a' }, 'b', ['maths']).classSubjects).toEqual({ b: ['maths'] });
  });

  it('cannot add an extra class to a student with no home class', () => {
    expect(withExtraClass({}, 'b').classIds).toEqual([]);
  });

  it('removes an extra class and its chosen subjects', () => {
    const s = { classId: 'a', classIds: ['a', 'b', 'c'], classSubjects: { b: ['maths'], c: ['art'] } };
    expect(withoutExtraClass(s, 'b')).toEqual({ classId: 'a', classIds: ['a', 'c'], classSubjects: { c: ['art'] } });
  });

  it('does not remove the home class this way', () => {
    const s = { classId: 'a', classIds: ['a', 'b'] };
    expect(withoutExtraClass(s, 'a').classIds).toEqual(['a', 'b']);
  });
});

describe('membershipError', () => {
  it('is fine with no extras, or extras with a home class', () => {
    expect(membershipError({ classId: '' })).toBe('');
    expect(membershipError({ classId: 'a', extraClassIds: ['b'] })).toBe('');
    expect(membershipError({ classId: 'a', extraClassIds: ['b'], classSubjects: { b: ['maths'] } })).toBe('');
  });

  it('refuses extras without a home class', () => {
    expect(membershipError({ classId: '', extraClassIds: ['b'] })).toMatch(/Choose a class/);
  });

  it('refuses a "chosen subjects" class with no subject chosen', () => {
    expect(membershipError({ classId: 'a', extraClassIds: ['b'], classSubjects: { b: [] } })).toMatch(/at least one subject/);
  });
});

describe('readClassSubjects', () => {
  it('reads the stored map, or the same map as JSON text', () => {
    expect(readClassSubjects({ b: ['maths'] })).toEqual({ b: ['maths'] });
    expect(readClassSubjects('{"b":["maths","art"]}')).toEqual({ b: ['maths', 'art'] });
  });

  it('is empty for anything else', () => {
    for (const v of [undefined, null, '', 'not json', 5, ['x'], '[1]']) expect(readClassSubjects(v)).toEqual({});
    expect(readClassSubjects({ b: 'maths', c: ['art', 7] })).toEqual({ c: ['art'] });
  });
});

describe('studentsTakingSubject', () => {
  const roster = [
    { uid: 'home', classId: 'b', classIds: ['b'] },
    { uid: 'all', classId: 'a', classIds: ['a', 'b'] },
    { uid: 'maths', classId: 'a', classIds: ['a', 'b'], classSubjects: { b: ['maths'] } },
    { uid: 'art', classId: 'a', classIds: ['a', 'b'], classSubjects: { b: ['art'] } },
  ];

  it('keeps home students, additional students with all subjects, and those who chose the subject', () => {
    expect(studentsTakingSubject(roster, 'b', 'maths').map((s) => s.uid)).toEqual(['home', 'all', 'maths']);
    expect(studentsTakingSubject(roster, 'b', 'art').map((s) => s.uid)).toEqual(['home', 'all', 'art']);
  });

  it('also drops the students excluded from the subject in that class', () => {
    expect(studentsTakingSubject(roster, 'b', 'maths', ['home', 'maths']).map((s) => s.uid)).toEqual(['all']);
  });
});
