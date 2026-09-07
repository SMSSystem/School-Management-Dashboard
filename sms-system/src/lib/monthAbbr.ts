/**
 * Uppercase 3-letter month abbreviation (e.g. "JAN") for a given year and
 * 0-indexed month (JS Date convention), via Intl rather than a hardcoded
 * lookup array — one source of truth instead of two independently
 * maintained ones that could drift.
 *
 * Shared by gradeTrackingPeriods.ts (grade-tracking period default labels)
 * and GridsheetPDF.tsx (month-column headers), which previously each had
 * their own independent implementation.
 */
export function monthAbbr(year: number, month: number): string {
  return new Date(year, month, 1)
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase();
}
