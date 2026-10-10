import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_COUNTS_ROOT,
  dashboardCountsKey,
  genderBreakdown,
} from '../dashboardCountsLogic';
import { isPersistableQueryKey } from '../queryPersistence';
import userCardSrc from '../../components/UserCard.tsx?raw';
import countChartSrc from '../../components/CountChart.tsx?raw';
import countsSrc from '../dashboardCounts.ts?raw';
import formModalSrc from '../../components/FormModal.tsx?raw';
import deleteExecutorSrc from '../deleteUserExecutor.ts?raw';

describe('genderBreakdown', () => {
  it('derives unknown from the total', () => {
    expect(genderBreakdown({ total: 10, male: 4, female: 5 })).toEqual({ male: 4, female: 5, unknown: 1 });
  });

  it('is never negative when the counts were read a moment apart', () => {
    expect(genderBreakdown({ total: 8, male: 5, female: 5 })).toEqual({ male: 5, female: 5, unknown: 0 });
    expect(genderBreakdown({ total: 0, male: 0, female: 0 })).toEqual({ male: 0, female: 0, unknown: 0 });
  });
});

describe('dashboard count keys', () => {
  it('are scoped by institution and kind under one root', () => {
    expect(dashboardCountsKey('inst-1', 'student')).toEqual([DASHBOARD_COUNTS_ROOT, 'inst-1', 'student']);
    expect(dashboardCountsKey('inst-1', 'studentGender')[2]).toBe('studentGender');
  });

  it('are persistable (a head-count is not personal data)', () => {
    expect(isPersistableQueryKey(dashboardCountsKey('inst-1', 'teacher'))).toBe(true);
  });
});

// The whole point of these cards is not to download the people they count.
describe('dashboard cards read counts, not documents', () => {
  it('UserCard and CountChart use no live listener and no document read', () => {
    for (const src of [userCardSrc, countChartSrc]) {
      expect(src).not.toMatch(/onSnapshot\s*\(/);
      expect(src).not.toMatch(/getDocs\s*\(/);
      expect(src).not.toMatch(/from ["']firebase\/firestore["']/);
    }
  });

  it('counts come from getCountFromServer with equality filters', () => {
    expect(countsSrc).toContain('getCountFromServer(');
    expect(countsSrc).not.toMatch(/onSnapshot\s*\(/);
    expect(countsSrc).not.toMatch(/getDocs\s*\(/);
  });

  it('saving or deleting a user refreshes the counts', () => {
    expect(formModalSrc).toContain('DASHBOARD_COUNTS_ROOT');
    expect(deleteExecutorSrc).toContain('DASHBOARD_COUNTS_ROOT');
  });
});
