import { describe, expect, it } from 'vitest';
import {
  CLASS_POPULATION_ROOT,
  activeGenderCounts,
  activePopulation,
  classPopulationKey,
  countByGender,
  formatGenderBreakdown,
  shortList,
  summariseHouses,
} from '../classPopulation';
import { isPersistableQueryKey } from '../queryPersistence';
import classesPageSrc from '../../scenes/(dashboard)/list/classes/index.tsx?raw';
import housesPageSrc from '../../scenes/(dashboard)/list/houses/index.tsx?raw';
import genderBreakdownSrc from '../../components/GenderBreakdown.tsx?raw';
import queriesSrc from '../classPopulationQueries.ts?raw';
import invalidateSrc from '../invalidateUserCounts.ts?raw';
import formModalSrc from '../../components/FormModal.tsx?raw';
import houseFormSrc from '../../components/forms/HouseForm.tsx?raw';
import executorSrc from '../deleteUserExecutor.ts?raw';
import { createUserFormSource as createUserSrc } from './createUserFormSource';
import { importSource as importSrc } from './importSource';
import classDetailSrc from '../../scenes/(dashboard)/list/classes/[id]/index.tsx?raw';
import houseDetailSrc from '../../scenes/(dashboard)/list/houses/[id]/index.tsx?raw';

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
      h1: { count: 3, male: 0, female: 0, unspecified: 3, classNames: ['1A', '1B'], classIds: ['c1', 'c2'] },
      h2: { count: 1, male: 0, female: 0, unspecified: 1, classNames: ['2A'], classIds: ['c3'] },
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
    expect(summariseHouses(users, classes)).toEqual({
      h1: { count: 2, male: 0, female: 0, unspecified: 2, classNames: ['1A', '1B'], classIds: ['c1', 'c2'] },
    });
  });

  it('counts a student with no class or an unknown class but adds no name for them', () => {
    const users = [
      { role: 'student', houseId: 'h1' },
      { role: 'student', houseId: 'h1', classId: 'gone' },
    ];
    expect(summariseHouses(users, classes)).toEqual({
      h1: { count: 2, male: 0, female: 0, unspecified: 2, classNames: [], classIds: ['gone'] },
    });
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

  it('splits each house by gender, leaving deactivated students out and counting a missing gender as unspecified', () => {
    const users = [
      { role: 'student', houseId: 'h1', classId: 'c1', gender: 'Male' },
      { role: 'student', houseId: 'h1', classId: 'c1', gender: 'Female' },
      { role: 'student', houseId: 'h1', classId: 'c2', gender: 'Female' },
      { role: 'student', houseId: 'h1', classId: 'c2' },
      { role: 'student', houseId: 'h1', classId: 'c2', gender: 'Male', status: 'inactive' },
    ];
    const h1 = summariseHouses(users, classes).h1;
    expect([h1.count, h1.male, h1.female, h1.unspecified]).toEqual([4, 1, 2, 1]);
  });
});

describe('activeGenderCounts', () => {
  it('subtracts the deactivated students of each gender, so the parts add up to the Population figure', () => {
    const c = activeGenderCounts({ total: 30, inactive: 4, male: 14, maleInactive: 3, female: 15, femaleInactive: 1 });
    expect(c).toEqual({ total: 26, male: 11, female: 14, unspecified: 1 });
    expect(c.male + c.female + c.unspecified).toBe(c.total);
  });

  it('is never negative when the counts were read a moment apart', () => {
    expect(activeGenderCounts({ total: 3, inactive: 0, male: 2, maleInactive: 0, female: 2, femaleInactive: 0 })).toEqual({
      total: 3,
      male: 2,
      female: 2,
      unspecified: 0,
    });
    expect(activeGenderCounts({ total: 0, inactive: 1, male: 0, maleInactive: 2, female: 0, femaleInactive: 0 }).male).toBe(0);
  });
});

describe('countByGender', () => {
  it('splits students already in hand the same way', () => {
    expect(countByGender([{ gender: 'Male' }, { gender: 'Female' }, { gender: 'Female' }, {}, { gender: 'other' }])).toEqual({
      total: 5,
      male: 1,
      female: 2,
      unspecified: 2,
    });
    expect(countByGender([])).toEqual({ total: 0, male: 0, female: 0, unspecified: 0 });
  });
});

describe('formatGenderBreakdown', () => {
  it('writes the short form for the table and the full form for the tooltip and screen readers', () => {
    const c = { total: 24, male: 12, female: 12, unspecified: 0 };
    expect(formatGenderBreakdown(c, 'short')).toBe('M 12 · F 12');
    expect(formatGenderBreakdown(c, 'full')).toBe('12 male, 12 female');
  });

  it('mentions students with no gender only when there are some', () => {
    const c = { total: 25, male: 12, female: 11, unspecified: 2 };
    expect(formatGenderBreakdown(c, 'short')).toBe('M 12 · F 11 · unspecified 2');
    expect(formatGenderBreakdown(c, 'full')).toBe('12 male, 11 female, 2 unspecified');
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
    expect(classPopulationKey('inst', 'c1')).toEqual([CLASS_POPULATION_ROOT, 'inst', 'c1', 'byGender']);
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

  it('the gender split is six aggregations, every one filtered on institution, student role and class', () => {
    // one shared base filter, plus: total, total inactive, Male, Male inactive, Female, Female inactive
    expect(queriesSrc).toContain("where('institutionId', '==', institutionId)");
    expect(queriesSrc).toContain("where('role', '==', 'student')");
    expect(queriesSrc).toContain("where('classIds', 'array-contains', classId)");
    expect(queriesSrc.match(/count\(/g)?.length).toBe(7); // the helper plus six calls
    expect(queriesSrc).toContain("where('gender', '==', 'Male')");
    expect(queriesSrc).toContain("where('gender', '==', 'Female')");
    expect(queriesSrc).toContain('activeGenderCounts(');
  });

  it('shows the split on the Classes list (a line under the name on a phone), the Houses list and the class detail page', () => {
    expect(classesPageSrc).toContain('<GenderBreakdown');
    expect(classesPageSrc).toContain('md:hidden');
    expect(housesPageSrc).toContain('<GenderBreakdown');
    expect(classDetailSrc).toContain('formatGenderBreakdown(');
  });

  it('the split is a tooltip where a pointer can hover and a line where it cannot, and screen readers get the full words', () => {
    expect(genderBreakdownSrc).toContain('[@media(hover:none)]:block');
    expect(genderBreakdownSrc).toContain('title=');
    expect(genderBreakdownSrc).toContain('sr-only');
    expect(genderBreakdownSrc).toContain('alwaysVisible');
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

// The list and its detail page must tell the same story.
describe('detail pages match the lists', () => {
  it('Class and House detail pages leave deactivated students out', () => {
    expect(classDetailSrc).toContain('isAccountInactive(');
    expect(houseDetailSrc).toContain('isAccountInactive(');
  });

  it('assigning students to a house refreshes the cached users the Houses list reads', () => {
    expect(houseDetailSrc).toMatch(/invalidateQueries\(\{ queryKey: \["users", institutionId\] \}\)/);
    expect(housesPageSrc).toMatch(/invalidateQueries\(\{ queryKey: \["users", institutionId\] \}\)/);
    // the form refreshes the list itself once its batch has moved students (a cancel changes nothing, so FormModal's
    // close no longer does it for a house)
    expect(houseFormSrc).toMatch(/await batch\.commit\(\);[\s\S]{0,400}invalidateQueries\(\{ queryKey: \["users", institutionId\] \}\)/);
    expect(formModalSrc).not.toMatch(/table === "house"/);
  });

  it('Houses list shows a dash, not a permanent placeholder, if the users read fails', () => {
    expect(housesPageSrc).toContain('usersError');
  });
});
