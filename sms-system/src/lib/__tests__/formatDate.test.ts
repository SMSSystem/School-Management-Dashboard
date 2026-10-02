import { describe, expect, it } from 'vitest';
import { formatDate, formatDateWithWeekday } from '../formatDate';

describe('formatDate', () => {
  it('formats an ISO date as "Month d, yyyy" without shifting the day', () => {
    expect(formatDate('2026-09-11')).toBe('September 11, 2026');
    expect(formatDate('2026-01-05')).toBe('January 5, 2026');
    expect(formatDate('2026-12-31')).toBe('December 31, 2026');
  });

  it('renders an em dash for empty input', () => {
    expect(formatDate('')).toBe('—');
  });
});

describe('formatDateWithWeekday', () => {
  it('adds the full weekday', () => {
    expect(formatDateWithWeekday('2026-09-18')).toBe('Friday, September 18, 2026');
    expect(formatDateWithWeekday('2026-09-11')).toBe('Friday, September 11, 2026');
    expect(formatDateWithWeekday('2026-10-07')).toBe('Wednesday, October 7, 2026');
  });

  it('renders an em dash for empty input', () => {
    expect(formatDateWithWeekday('')).toBe('—');
  });
});
