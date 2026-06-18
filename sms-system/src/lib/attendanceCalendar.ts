import type { NonSchoolDayDocument } from '@/lib/firebase';

export function isNonSchoolDay(dateStr: string, days: NonSchoolDayDocument[]): boolean {
  return days.some((d) => {
    if (!d.isActive) return false;
    if (d.type === 'single' && d.date)
      return d.date === dateStr;
    if (d.type === 'range' && d.startDate && d.endDate)
      return dateStr >= d.startDate && dateStr <= d.endDate;
    return false;
  });
}

/** True when the date is a configured instructional day. */
export function isSchoolDay(
  dateStr: string,
  schoolWeekDays: number[],    // [1,2,3,4,5] = Mon–Fri
  nonSchoolDays: NonSchoolDayDocument[],
): boolean {
  // Parse at noon UTC to avoid any date-boundary edge cases
  const date = new Date(dateStr + 'T12:00:00Z');
  return schoolWeekDays.includes(date.getUTCDay()) && !isNonSchoolDay(dateStr, nonSchoolDays);
}

/**
 * Returns true if dateStr falls in a fortnightly session week relative to
 * termStartDate. offset 0 = meets in term weeks 0,2,4… (first week and every
 * other); offset 1 = meets in weeks 1,3,5…
 */
export function isFortnightlySessionDay(
  dateStr: string,
  termStartDate: string,
  offset: 0 | 1,
): boolean {
  const termStart = new Date(termStartDate + 'T12:00:00Z');
  const day       = new Date(dateStr       + 'T12:00:00Z');
  const weekIndex = Math.floor(
    (day.getTime() - termStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return weekIndex >= 0 && weekIndex % 2 === offset;
}

/** Counts all expected sessions (school days × sessionsPerDay) within a date range. */
export function countExpectedSessions(
  startISO: string,
  endISO: string,
  schoolWeekDays: number[],
  nonSchoolDays: NonSchoolDayDocument[],
  sessionsPerDay: number, // 2 for General Attendance; 1 for Subject Attendance
): number {
  let count = 0;
  const cursor = new Date(startISO + 'T12:00:00Z');
  const end    = new Date(endISO   + 'T12:00:00Z');
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isSchoolDay(iso, schoolWeekDays, nonSchoolDays)) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count * sessionsPerDay;
}
