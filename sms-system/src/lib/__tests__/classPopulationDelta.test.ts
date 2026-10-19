import { describe, expect, it } from 'vitest';
import { bucketOf, populationDelta, storedPopulationOf, type StudentCountState } from '../classPopulationDelta';

const classes = new Set(['c1', 'c2', 'c3']);
const student = (over: Partial<StudentCountState> = {}): StudentCountState => ({ classIds: ['c1'], gender: 'Male', status: 'active', ...over });
const z = { male: 0, female: 0, unspecified: 0 };

describe('bucketOf', () => {
  it('maps Male and Female, and everything else to unspecified', () => {
    expect(bucketOf('Male')).toBe('male');
    expect(bucketOf('Female')).toBe('female');
    expect(bucketOf('Other')).toBe('unspecified');
    expect(bucketOf(null)).toBe('unspecified');
    expect(bucketOf(undefined)).toBe('unspecified');
    expect(bucketOf('male')).toBe('unspecified'); // the forms write the capitalised value
  });
});

describe('populationDelta', () => {
  it('a new student adds one to each of their classes, by gender', () => {
    expect(populationDelta(null, student({ classIds: ['c1', 'c2'], gender: 'Female' }), classes)).toEqual({
      c1: { ...z, female: 1 },
      c2: { ...z, female: 1 },
    });
  });

  it('a deleted student takes one off each of their classes', () => {
    expect(populationDelta(student({ classIds: ['c1', 'c2'] }), null, classes)).toEqual({
      c1: { ...z, male: -1 },
      c2: { ...z, male: -1 },
    });
  });

  it('moving the home class moves one count from the old class to the new one', () => {
    expect(populationDelta(student({ classIds: ['c1'] }), student({ classIds: ['c2'] }), classes)).toEqual({
      c1: { ...z, male: -1 },
      c2: { ...z, male: 1 },
    });
  });

  it('adding and removing an additional class touches only that class', () => {
    expect(populationDelta(student({ classIds: ['c1'] }), student({ classIds: ['c1', 'c2'] }), classes)).toEqual({ c2: { ...z, male: 1 } });
    expect(populationDelta(student({ classIds: ['c1', 'c2'] }), student({ classIds: ['c1'] }), classes)).toEqual({ c2: { ...z, male: -1 } });
  });

  it('a gender change moves a count between buckets of every class the student keeps', () => {
    expect(populationDelta(student({ gender: 'Male' }), student({ gender: 'Female' }), classes)).toEqual({ c1: { ...z, male: -1, female: 1 } });
    expect(populationDelta(student({ gender: 'Female' }), student({ gender: undefined }), classes)).toEqual({ c1: { ...z, female: -1, unspecified: 1 } });
  });

  it('deactivating removes the student from every class, reactivating adds them back', () => {
    expect(populationDelta(student({ classIds: ['c1', 'c2'] }), student({ classIds: ['c1', 'c2'], status: 'inactive' }), classes)).toEqual({
      c1: { ...z, male: -1 },
      c2: { ...z, male: -1 },
    });
    expect(populationDelta(student({ status: 'inactive' }), student({ status: 'active' }), classes)).toEqual({ c1: { ...z, male: 1 } });
  });

  it('a missing status is active, as in firestore.rules', () => {
    expect(populationDelta(null, { classIds: ['c1'], gender: 'Male' }, classes)).toEqual({ c1: { ...z, male: 1 } });
    expect(populationDelta({ classIds: ['c1'], gender: 'Male' }, student({ status: 'inactive' }), classes)).toEqual({ c1: { ...z, male: -1 } });
  });

  it('an inactive student created or deleted changes nothing', () => {
    expect(populationDelta(null, student({ status: 'inactive' }), classes)).toEqual({});
    expect(populationDelta(student({ status: 'inactive' }), null, classes)).toEqual({});
  });

  it('an unchanged student gives an empty delta, so no class is written', () => {
    expect(populationDelta(student({ classIds: ['c1', 'c2'] }), student({ classIds: ['c1', 'c2'] }), classes)).toEqual({});
  });

  it('skips a class that no longer exists (a student keeps the id of a deleted home class)', () => {
    expect(populationDelta(student({ classIds: ['gone'] }), student({ classIds: ['gone', 'c1'] }), classes)).toEqual({ c1: { ...z, male: 1 } });
    expect(populationDelta(null, student({ classIds: ['gone'] }), classes)).toEqual({});
  });

  it('counts a class listed twice once, and ignores an empty id', () => {
    expect(populationDelta(null, student({ classIds: ['c1', 'c1', ''] }), classes)).toEqual({ c1: { ...z, male: 1 } });
  });

  it('a student in no class contributes nothing', () => {
    expect(populationDelta(null, student({ classIds: [] }), classes)).toEqual({});
  });
});

describe('storedPopulationOf', () => {
  it('is undefined until the class has a baseline, even if increments have already created a population', () => {
    expect(storedPopulationOf({ population: { male: 1, female: 0, unspecified: 0 } })).toBeUndefined();
    expect(storedPopulationOf({})).toBeUndefined();
    expect(storedPopulationOf({ populationBaseline: null, population: { male: 3 } })).toBeUndefined();
  });

  it('gives the stored counts with their total once there is a baseline', () => {
    expect(storedPopulationOf({ populationBaseline: {}, population: { male: 12, female: 10, unspecified: 2 } })).toEqual({ total: 24, male: 12, female: 10, unspecified: 2 });
  });

  it('never shows a negative number if a counter has drifted, and treats a missing bucket as 0', () => {
    expect(storedPopulationOf({ populationBaseline: {}, population: { male: -2, female: 5 } })).toEqual({ total: 5, male: 0, female: 5, unspecified: 0 });
  });

  it('is undefined if the stored value is not a map', () => {
    expect(storedPopulationOf({ populationBaseline: {}, population: 7 })).toBeUndefined();
    expect(storedPopulationOf({ populationBaseline: {} })).toBeUndefined();
  });
});
