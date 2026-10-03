import { describe, expect, it } from 'vitest';
import { formatCapacity, isOverCapacity, subjectsForClass } from '../classSubjects';

const subjects = [
  { id: 's1', name: 'Mathematics', classScope: 'institution' as const, classIds: [] },
  { id: 's2', name: 'Art', classScope: 'class' as const, classIds: ['c1', 'c2'] },
  { id: 's3', name: 'Drama', classScope: 'class' as const, classIds: ['c2'] },
  { id: 's4', name: 'Biology', classScope: 'class' as const, classIds: ['c1'] },
];

describe('subjectsForClass', () => {
  it('includes institution-wide subjects and those scoped to the class, A-Z', () => {
    expect(subjectsForClass(subjects, 'c1').map((s) => s.name)).toEqual(['Art', 'Biology', 'Mathematics']);
    expect(subjectsForClass(subjects, 'c2').map((s) => s.name)).toEqual(['Art', 'Drama', 'Mathematics']);
  });

  it('leaves out subjects scoped to other classes', () => {
    expect(subjectsForClass(subjects, 'c9').map((s) => s.name)).toEqual(['Mathematics']);
  });

  it('copes with a list that has not loaded and a subject with no classIds', () => {
    expect(subjectsForClass(undefined, 'c1')).toEqual([]);
    const odd = [{ id: 'x', name: 'X', classScope: 'class' as const, classIds: undefined as unknown as string[] }];
    expect(subjectsForClass(odd, 'c1')).toEqual([]);
  });
});

describe('capacity', () => {
  it('formats enrolled against capacity, or just the count with no capacity', () => {
    expect(formatCapacity(12, 30)).toBe('12 of 30');
    expect(formatCapacity(12, 0)).toBe('12');
    expect(formatCapacity(12, undefined)).toBe('12');
  });

  it('flags only a class that is over its capacity', () => {
    expect(isOverCapacity(31, 30)).toBe(true);
    expect(isOverCapacity(30, 30)).toBe(false);
    expect(isOverCapacity(5, 0)).toBe(false);
    expect(isOverCapacity(5, undefined)).toBe(false);
  });
});
