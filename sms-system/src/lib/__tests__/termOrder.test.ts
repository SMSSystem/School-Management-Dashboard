import { describe, expect, it } from 'vitest';
import { sortTermsForCalendar } from '../termOrder';

const t = (name: string, startDate: string, endDate: string, academicYearId?: string) => ({ name, startDate, endDate, academicYearId });
const names = (list: { name: string }[]) => list.map((x) => x.name);

describe('standard calendar', () => {
  const terms = [
    t('Term 3', '2027-04-19', '2027-07-09'),
    t('Term 1', '2026-09-01', '2026-12-18'),
    t('Term 2', '2027-01-04', '2027-04-02'),
  ];

  it('lists the earliest start date first, whatever order they come in', () => {
    expect(names(sortTermsForCalendar(terms, 'academic_year'))).toEqual(['Term 1', 'Term 2', 'Term 3']);
    expect(names(sortTermsForCalendar([...terms].reverse(), 'academic_year'))).toEqual(['Term 1', 'Term 2', 'Term 3']);
  });

  it('treats a calendar mode that was never set (an older institution) as standard', () => {
    expect(names(sortTermsForCalendar(terms, undefined))).toEqual(['Term 1', 'Term 2', 'Term 3']);
  });

  it('puts terms that start the same day in name order, A to Z', () => {
    const same = [t('Beta', '2026-09-01', '2026-12-18'), t('Alpha', '2026-09-01', '2027-01-30'), t('Early', '2026-01-05', '2026-03-31')];
    expect(names(sortTermsForCalendar(same, 'academic_year'))).toEqual(['Early', 'Alpha', 'Beta']);
  });

  it('orders across years', () => {
    const years = [t('2027 T1', '2027-09-01', '2027-12-17'), t('2026 T3', '2027-04-19', '2027-07-09'), t('2026 T1', '2026-09-01', '2026-12-18')];
    expect(names(sortTermsForCalendar(years, 'academic_year'))).toEqual(['2026 T1', '2026 T3', '2027 T1']);
  });
});

describe('custom calendar', () => {
  // Time blocks run at the same time; the start date decides nothing here.
  const blocks = [
    t('Old block', '2026-01-05', '2026-06-30', 'y1'),
    t('New block, ends late', '2026-03-02', '2026-12-18', 'y3'),
    t('New block, ends soon', '2026-09-07', '2026-10-30', 'y2'),
    t('Standalone', '2025-01-06', '2025-03-28'),
  ];
  const created = { y1: 1000, y2: 3000, y3: 3000 };

  it('puts the most recently created year first and the soonest ending among equals', () => {
    expect(names(sortTermsForCalendar(blocks, 'custom', created))).toEqual([
      'New block, ends soon',
      'New block, ends late',
      'Old block',
      'Standalone',
    ]);
  });

  it('does not order by start date', () => {
    const sorted = names(sortTermsForCalendar(blocks, 'custom', created));
    expect(sorted).not.toEqual(names(sortTermsForCalendar(blocks, 'academic_year')));
  });

  it('puts a term with no academic year, or an unknown one, last, then by end date and name', () => {
    const odd = [t('B', '2026-01-01', '2026-02-01', 'gone'), t('A', '2026-01-01', '2026-02-01'), t('C', '2026-01-01', '2026-01-15'), t('Real', '2026-05-01', '2026-08-01', 'y1')];
    expect(names(sortTermsForCalendar(odd, 'custom', { y1: 5 }))).toEqual(['Real', 'C', 'A', 'B']);
  });

  it('works with no creation times at all', () => {
    expect(names(sortTermsForCalendar(blocks, 'custom'))).toEqual(['Standalone', 'Old block', 'New block, ends soon', 'New block, ends late']);
  });
});

describe('both', () => {
  it('returns a new array and leaves the input as it was', () => {
    const input = [t('B', '2026-02-01', '2026-03-01'), t('A', '2026-01-01', '2026-02-01')];
    const copy = [...input];
    const out = sortTermsForCalendar(input, 'academic_year');
    expect(out).not.toBe(input);
    expect(input).toEqual(copy);
  });

  it('handles no terms', () => {
    expect(sortTermsForCalendar([], 'academic_year')).toEqual([]);
    expect(sortTermsForCalendar([], 'custom')).toEqual([]);
  });
});
