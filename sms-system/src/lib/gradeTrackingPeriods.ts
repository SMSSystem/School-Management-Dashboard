import type { GradeTrackingFrequency, TermDocument } from '@/lib/firebase';
import { monthAbbr } from '@/lib/monthAbbr';

export type GradeTrackingPeriod = {
  /** Stable index-based key, used for label overrides (TermDocument.periodLabelOverrides). */
  key: string;
  label: string;
  /** ISO "YYYY-MM-DD", first day of the period's first month. */
  startDate: string;
  /** ISO "YYYY-MM-DD", last day of the period's last month. */
  endDate: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Splits a term's calendar-month range into grade-tracking periods, labeled by
 * month abbreviation (e.g. "JAN/FEB" for bi-monthly, "MAR" for monthly).
 *
 * Bi-monthly pairs consecutive months two at a time; an odd trailing month
 * stands alone as its own period rather than folding into the previous pair.
 */
export function generateGradeTrackingPeriods(
  term: Pick<TermDocument, 'startDate' | 'endDate' | 'periodLabelOverrides'>,
  frequency: GradeTrackingFrequency,
): GradeTrackingPeriod[] {
  const start = new Date(`${term.startDate}T12:00:00Z`);
  const end = new Date(`${term.endDate}T12:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const months: { year: number; month: number }[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  const groupSize = frequency === 'bi-monthly' ? 2 : 1;
  const overrides = term.periodLabelOverrides ?? {};
  const periods: GradeTrackingPeriod[] = [];

  for (let i = 0; i < months.length; i += groupSize) {
    const group = months.slice(i, i + groupSize);
    const key = String(periods.length);
    const first = group[0];
    const last = group[group.length - 1];
    const defaultLabel = group.map((g) => monthAbbr(g.year, g.month)).join('/');
    periods.push({
      key,
      label: overrides[key] ?? defaultLabel,
      startDate: `${first.year}-${pad2(first.month + 1)}-01`,
      endDate: `${last.year}-${pad2(last.month + 1)}-${pad2(lastDayOfMonth(last.year, last.month))}`,
    });
  }

  return periods;
}
