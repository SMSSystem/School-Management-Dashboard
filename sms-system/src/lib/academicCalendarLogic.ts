import { getJamaicanPublicHolidays } from '@/lib/holidays';

// The Academic Calendar page's rules (scenes/(dashboard)/academic-calendar): date arithmetic on ISO dates, the
// default terms and public holidays of a year, the status a term is saved with, the next year's draft, and the
// checks the set-up wizards run before moving on or saving. Plain functions, so they can be tested without a
// screen. Dates are "YYYY-MM-DD" strings, read at noon UTC so a time zone never moves the day.

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildYearName(start: string, end: string): string {
  return `${start.slice(0, 4)}–${end.slice(0, 4)}`;
}

export function addOneYear(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return toISO(d);
}

export function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  });
}

export function nextSchoolMonday(isoDate: string, holidaySet: Set<string>): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 1 ? 0 : (8 - day) % 7));
  while (holidaySet.has(toISO(d))) d.setUTCDate(d.getUTCDate() + 7);
  return toISO(d);
}

export type DurationUnit = 'days' | 'weeks' | 'months';

export function addDuration(startIso: string, count: number, unit: DurationUnit): string {
  const d = new Date(startIso + 'T12:00:00Z');
  if (unit === 'days') d.setUTCDate(d.getUTCDate() + count);
  else if (unit === 'weeks') d.setUTCDate(d.getUTCDate() + count * 7);
  else d.setUTCMonth(d.getUTCMonth() + count);
  return toISO(d);
}

// Inverse of addDuration — used by the quick-create flow (§9) to express an
// existing time block's own start/end dates as a {count, unit} pair, so its
// duration can be pre-filled as an editable default rather than re-derived
// from scratch. Prefers weeks when the span divides evenly (the common
// case — "10 weeks" reads better than "70 days"), otherwise falls back to
// days; months are deliberately never inferred back (a calendar-month span
// isn't a fixed day count, so round-tripping it isn't reliable).
export function deriveDuration(startIso: string, endIso: string): { count: number; unit: DurationUnit } {
  const start = new Date(startIso + 'T12:00:00Z').getTime();
  const end = new Date(endIso + 'T12:00:00Z').getTime();
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000));
  return days > 0 && days % 7 === 0 ? { count: days / 7, unit: 'weeks' } : { count: Math.max(days, 1), unit: 'days' };
}

export const ALL_WEEK_DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

// ─── Wizard types ─────────────────────────────────────────────────────────────

export interface WizardTerm {
  number: 1 | 2 | 3;
  name: string;
  defaultName: string;
  startDate: string;
  endDate: string;
}

export interface WizardHoliday {
  id: number;
  name: string;
  date: Date;
  isoDate: string;
  interacted: boolean;
  confirmed: boolean;
}

export interface CustomNSD {
  id: number;
  type: 'single' | 'range';
  date: string;
  startDate: string;
  endDate: string;
  reason: string;
}

// ─── What the wizard starts from ──────────────────────────────────────────────

/** The three terms offered for a year that starts in `yearStart`'s calendar year (Christmas, Easter, Summer). */
export function defaultTermsFor(yearStart: string): WizardTerm[] {
  const year = parseInt(yearStart.slice(0, 4));
  const holidaySet = new Set(
    [...getJamaicanPublicHolidays(year), ...getJamaicanPublicHolidays(year + 1)].map((h) => toISO(h.date))
  );
  return [
    { number: 1, name: 'Christmas Term', defaultName: 'Christmas Term', startDate: nextSchoolMonday(`${year}-09-01`, holidaySet),     endDate: `${year}-12-20` },
    { number: 2, name: 'Easter Term',    defaultName: 'Easter Term',    startDate: nextSchoolMonday(`${year + 1}-01-06`, holidaySet), endDate: `${year + 1}-04-04` },
    { number: 3, name: 'Summer Term',    defaultName: 'Summer Term',    startDate: nextSchoolMonday(`${year + 1}-04-22`, holidaySet), endDate: `${year + 1}-08-15` },
  ];
}

/** The public holidays that fall inside the year, all offered as observed but none yet reviewed. */
export function initialHolidaysFor(yearStart: string, yearEnd: string): WizardHoliday[] {
  const year = parseInt(yearStart.slice(0, 4));
  const raw = getJamaicanPublicHolidays(year);
  const nextYearRaw = getJamaicanPublicHolidays(year + 1);
  // Include holidays from both years that fall within the academic year
  const combined = [...raw, ...nextYearRaw];
  const filtered = combined.filter((h) => {
    const iso = toISO(h.date);
    return iso >= yearStart && iso <= yearEnd;
  });
  return filtered.map((h, i) => ({
    id: i,
    name: h.name,
    date: h.date,
    isoDate: toISO(h.date),
    interacted: false,
    confirmed: true, // default checked, user must explicitly interact
  }));
}

/** The status a term is saved with: over, running today, or still to come. */
export function termStatusFor(startDate: string, endDate: string, todayISO: string): 'completed' | 'active' | 'upcoming' {
  return endDate < todayISO ? 'completed' : startDate <= todayISO ? 'active' : 'upcoming';
}

/** The draft made automatically when the active year has ended: the same length and school week, a year on. */
export function nextYearDraftFor(activeYear: { startDate: string; endDate: string; schoolWeekDays: number[] }) {
  const nextStart = addOneYear(activeYear.startDate);
  const nextEnd   = addOneYear(activeYear.endDate);
  return {
    name: buildYearName(nextStart, nextEnd),
    startDate: nextStart,
    endDate: nextEnd,
    schoolWeekDays: activeYear.schoolWeekDays,
  };
}

// ─── Checks before moving on or saving: the message to show, or null ─────────

export function validateYearDates(yearStart: string, yearEnd: string): string | null {
  if (!yearStart || !yearEnd || yearEnd <= yearStart) return 'Enter valid start and end dates (end must be after start).';
  return null;
}

export function validateTerms(terms: WizardTerm[]): string | null {
  for (const t of terms) {
    if (!t.name.trim()) return `Term ${t.number} name is required.`;
    if (!t.startDate || !t.endDate || t.endDate <= t.startDate) return `Term ${t.number}: end date must be after start date.`;
  }
  return null;
}

export function validateSchoolWeekDays(schoolWeekDays: number[]): string | null {
  if (schoolWeekDays.length === 0) return 'Select at least one school day.';
  return null;
}

export function validateHolidaysReviewed(holidays: WizardHoliday[]): string | null {
  const notInteracted = holidays.filter((h) => !h.interacted);
  if (notInteracted.length > 0) {
    return `Please check or uncheck each holiday before proceeding. ${notInteracted.length} holiday(s) not reviewed.`;
  }
  return null;
}

export function validateCustomNonSchoolDays(customNSDs: CustomNSD[]): string | null {
  for (const n of customNSDs) {
    if (!n.reason.trim()) return 'Each non-school day entry requires a reason.';
    if (n.type === 'single' && !n.date) return 'Each single non-school day requires a date.';
    if (n.type === 'range' && (!n.startDate || !n.endDate)) return 'Each date range requires start and end dates.';
    if (n.type === 'range' && n.endDate < n.startDate) return 'Range end date must be on or after start date.';
  }
  return null;
}

/** One non-school day added from the management view (fewer checks than the wizard's: no range order). */
export function validateNewNonSchoolDay(n: Omit<CustomNSD, 'id'>): string | null {
  if (!n.reason.trim()) return 'Reason is required.';
  if (n.type === 'single' && !n.date) return 'Date is required.';
  if (n.type === 'range' && (!n.startDate || !n.endDate)) return 'Start and end dates are required.';
  return null;
}

/**
 * A new time block (custom-calendar mode): the first-time wizard asks for a duration only when it is chosen
 * over an end date (`checkDuration`); the quick-create modal always asks for one.
 */
export function validateTimeBlock({
  name,
  startDate,
  checkDuration,
  parsedDurationCount,
  effectiveEndDate,
  schoolWeekDays,
}: {
  name: string;
  startDate: string;
  checkDuration: boolean;
  parsedDurationCount: number;
  effectiveEndDate: string;
  schoolWeekDays: number[];
}): string | null {
  if (!name.trim()) return 'Time block name is required.';
  if (!startDate) return 'Start date is required.';
  if (checkDuration && !(parsedDurationCount > 0)) return 'Duration must be a positive number.';
  if (!effectiveEndDate || effectiveEndDate <= startDate) return 'End date must be after the start date.';
  if (schoolWeekDays.length === 0) return 'Select at least one session day.';
  return null;
}

/** Session days a time block loses when its list changes from `current` to `next`. */
export function computeRemovedDays(current: number[], next: number[]): number[] {
  return current.filter((d) => !next.includes(d));
}
