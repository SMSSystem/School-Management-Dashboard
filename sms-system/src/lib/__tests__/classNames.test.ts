import { describe, expect, it } from 'vitest';
import { classNameMap, classNameOf } from '../classNames';

const classes = [
  { id: 'c1', name: 'Grade 3A' },
  { id: 'c2', name: 'Grade 4B' },
];

describe('classNameOf', () => {
  it('returns the class name for an id', () => {
    expect(classNameOf(classes, 'c2')).toBe('Grade 4B');
  });

  it('never returns the raw id: an unknown or missing class is a dash', () => {
    expect(classNameOf(classes, 'gone')).toBe('—');
    expect(classNameOf(classes, null)).toBe('—');
    expect(classNameOf(classes, undefined)).toBe('—');
    expect(classNameOf(classes, '')).toBe('—');
  });

  it('is a dash while the class list has not loaded', () => {
    expect(classNameOf(undefined, 'c1')).toBe('—');
  });

  it('uses a custom fallback', () => {
    expect(classNameOf(classes, null, 'No class')).toBe('No class');
  });
});

describe('classNameMap', () => {
  it('maps ids to names', () => {
    expect(classNameMap(classes)).toEqual({ c1: 'Grade 3A', c2: 'Grade 4B' });
    expect(classNameMap(undefined)).toEqual({});
  });
});
