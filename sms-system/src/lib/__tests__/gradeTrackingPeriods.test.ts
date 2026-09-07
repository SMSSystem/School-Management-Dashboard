import { describe, it, expect } from 'vitest';
import { generateGradeTrackingPeriods } from '../gradeTrackingPeriods';

describe('generateGradeTrackingPeriods', () => {
  it('pairs consecutive months for bi-monthly frequency', () => {
    const periods = generateGradeTrackingPeriods(
      { startDate: '2026-01-15', endDate: '2026-04-10' },
      'bi-monthly',
    );
    expect(periods.map((p) => p.label)).toEqual(['JAN/FEB', 'MAR/APR']);
    expect(periods[0]).toMatchObject({ key: '0', startDate: '2026-01-01', endDate: '2026-02-28' });
    expect(periods[1]).toMatchObject({ key: '1', startDate: '2026-03-01', endDate: '2026-04-30' });
  });

  it('gives an odd trailing month its own solo period rather than folding it in', () => {
    const periods = generateGradeTrackingPeriods(
      { startDate: '2026-01-01', endDate: '2026-05-31' },
      'bi-monthly',
    );
    expect(periods.map((p) => p.label)).toEqual(['JAN/FEB', 'MAR/APR', 'MAY']);
  });

  it('produces one period per month for monthly frequency', () => {
    const periods = generateGradeTrackingPeriods(
      { startDate: '2026-01-01', endDate: '2026-03-31' },
      'monthly',
    );
    expect(periods.map((p) => p.label)).toEqual(['JAN', 'FEB', 'MAR']);
  });

  it('applies label overrides by period key', () => {
    const periods = generateGradeTrackingPeriods(
      { startDate: '2026-01-01', endDate: '2026-02-28', periodLabelOverrides: { '0': 'Term Start' } },
      'bi-monthly',
    );
    expect(periods[0].label).toBe('Term Start');
  });

  it('handles a leap-year February correctly', () => {
    const periods = generateGradeTrackingPeriods({ startDate: '2028-01-01', endDate: '2028-02-29' }, 'monthly');
    expect(periods[1]).toMatchObject({ label: 'FEB', endDate: '2028-02-29' });
  });

  it('returns an empty array for an invalid range', () => {
    expect(generateGradeTrackingPeriods({ startDate: '2026-05-01', endDate: '2026-01-01' }, 'monthly')).toEqual([]);
  });
});
