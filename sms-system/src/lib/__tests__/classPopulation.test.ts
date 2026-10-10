import { describe, expect, it } from 'vitest';
import {
  CLASS_POPULATION_ROOT,
  activePopulation,
  classPopulationKey,
  shortList,
  summariseHouses,
} from '../classPopulation';
import { isPersistableQueryKey } from '../queryPersistence';
import classesPageSrc from '../../scenes/(dashboard)/list/classes/index.tsx?raw';
import housesPageSrc from '../../scenes/(dashboard)/list/houses/index.tsx?raw';
import queriesSrc from '../classPopulationQueries.ts?raw';
import invalidateSrc from '../invalidateUserCounts.ts?raw';
import formModalSrc from '../../components/FormModal.tsx?raw';
import executorSrc from '../deleteUserExecutor.ts?raw';
import createUserSrc from '../../components/forms/AdminCreateUserForm.tsx?raw';
import importSrc from '../../scenes/(dashboard)/import/index.tsx?raw';

describe('activePopulation', () => {
  it('is all students minus the deactivated ones', () => {
    expect(activePopulation(30, 4)).toBe(26);
    expect(activePopulation(12, 0)).toBe(12);
  });

  it('is never negative when the two counts were read a moment apart', () => {
    expect(activePopulation(3, 5)).toBe(0);
    expect(activePopulation(0, 0)).toBe(0);
  });
});

describe('summariseHouses', () => {
  const classes = { c1: '1A', c2: '1B', c3: '2A' };

  it('counts students per house and lists the distinct class names A-Z', () => {
    const users = [
      { role: 'student', houseId: 'h1', classId: 'c2' },
      { role: 'student', houseId: 'h1', classId: 'c1' },
      { role: 'student', houseId: 'h1', classId: 'c1' },
      { role: 'student', houseId: 'h2', classId: 'c3' },
    ];
    expect(summariseHouses(users, classes)).toEqual({
      h1: { count: 3, classNames: ['1A', '1B'] },
      h2: { count: 1, classNames: ['2A'] },
    });
  });

  it('skips deactivated accounts, non-students and users with no house', () => {
    const users = [
      { role: 'student', houseId: 'h1', classId: 'c1', status: 'inactive' },
      { role: 'student', houseId: 'h1', classId: 'c1', status: 'active' },
      { role: 'student', houseId: 'h1', classId: 'c2' }, // no status field: active
      { role: 'regular_teacher', houseId: 'h1', classId: 'c3' },
      { role: 'student', classId: 'c3' },
    ];
    expect(summariseHouses(users, classes)).toEqual({ h1: { count: 2, classNames: ['1A', '1B'] } });
  });

  it('counts a student with no class or an unknown class but adds no name for them', () => {
    const users = [
      { role: 'student', houseId: 'h1' },
      { role: 'student', houseId: 'h1', classId: 'gone' },
    ];
    expect(summariseHouses(users, classes)).toEqual({ h1: { count: 2, classNames: [] } });
  });

  it('sorts class names naturally (2 before 10)', () => {
    const users = [
      { role: 'student', houseId: 'h1', classId: 'a' },
      { role: 'student', houseId: 'h1', classId: 'b' },
    ];
    expect(summariseHouses(users, { a: 'Class 10', b: 'Class 2' }).h1.classNames).toEqual(['Class 2', 'Class 10']);
  });

  it('handles no users', () => {
    expect(summariseHouses(undefined, classes)).toEqual({});
  });
});

describe('shortList', () => {
  it('shows everything when it fits', () => {
    expect(shortList(['1A', '1B'])).toEqual({ text: '1A, 1B', full: '1A, 1B' });
  });

  it('truncates with a "+n" and keeps the full list for the tooltip', () => {
    expect(shortList(['1A', '1B', '1C', '1D', '1E'])).toEqual({
      text: '1A, 1B, 1C +2',
      full: '1A, 1B, 1C, 1D, 1E',
    });
  });

  it('is empty for no names', () => {
    expect(shortList([])).toEqual({ text: '', full: '' });
  });
});

describe('class population keys and persistence', () => {
  it('are scoped by institution and class under one root', () => {
    expect(classPopulationKey('inst', 'c1')).toEqual([CLASS_POPULATION_ROOT, 'inst', 'c1']);
  });

  it('are persistable (a head-count is not personal data)', () => {
    expect(isPersistableQueryKey(classPopulationKey('inst', 'c1'))).toBe(true);
  });
});

// Source-text pins for the decisions behind the Houses / Classes list changes.
describe('Classes and Houses lists', () => {
  it('Classes list shows Population and no longer lists Grade or Supervisor', () => {
    expect(classesPageSrc).toContain('useClassPopulations(');
    expect(classesPageSrc).toContain('formatCapacity(');
    expect(classesPageSrc).not.toMatch(/header:\s*"Grade"/);
    expect(classesPageSrc).not.toMatch(/header:\s*"Supervisor"/);
    expect(classesPageSrc).not.toMatch(/header:\s*"Capacity"/);
  });

  it('Population is read with count() aggregations and excludes deactivated students', () => {
    expect(queriesSrc).toContain('getCountFromServer(');
    expect(queriesSrc).toContain("where('status', '==', 'inactive')");
    expect(queriesSrc).not.toMatch(/getDocs\s*\(/);
    expect(queriesSrc).not.toMatch(/onSnapshot\s*\(/);
  });

  it('Houses list shows Class instead of Description and has no per-house count query', () => {
    expect(housesPageSrc).toMatch(/header:\s*"Class"/);
    expect(housesPageSrc).not.toMatch(/header:\s*"Description"/);
    expect(housesPageSrc).toContain('summariseHouses(');
    expect(housesPageSrc).not.toContain('studentCounts');
    expect(housesPageSrc).not.toContain('fetchCounts');
  });

  it('every user-changing path refreshes the counts', () => {
    expect(invalidateSrc).toContain('DASHBOARD_COUNTS_ROOT');
    expect(invalidateSrc).toContain('CLASS_POPULATION_ROOT');
    for (const src of [formModalSrc, executorSrc, createUserSrc, importSrc]) {
      expect(src).toContain('invalidateUserCounts(');
    }
  });
});
