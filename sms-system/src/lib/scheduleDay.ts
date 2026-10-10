// Pure helpers for the mobile Schedule (day strip + agenda). Timetable slots are
// weekly-recurring (days + "HH:mm" startTime + duration in minutes).

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_SHORT: Record<DayKey, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
};
export const DAY_LONG: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

export type SlotLike = {
  id: string;
  subjectName: string;
  teacherName?: string;
  room?: string;
  days?: string[];
  startTime?: string;
  duration: number;
  // Name of the term / time block the slot belongs to (denormalised on write).
  termName?: string;
};

export type ActiveTerm = { id: string; start: string; end: string };

// The terms a class-scoped viewer (student, parent) sees slots for: every
// currently active time block (custom mode), else the single in-session term
// (academic mode). Both inputs are never non-empty together, by construction of
// useInstitutionAcademicCalendar. Shared by useClassTimetable and BigCalendar so
// the rule lives in one place.
export function activeTerms(
  activeTimeBlocks: { term: { id: string; startDate: string; endDate: string } }[],
  activeTerm: { id: string; startDate: string; endDate: string } | null,
): ActiveTerm[] {
  if (activeTimeBlocks.length > 0) {
    return activeTimeBlocks.map((b) => ({ id: b.term.id, start: b.term.startDate, end: b.term.endDate }));
  }
  return activeTerm ? [{ id: activeTerm.id, start: activeTerm.startDate, end: activeTerm.endDate }] : [];
}

const JS_DAY_TO_KEY: (DayKey | null)[] = [null, 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// Today's key, or Monday on Sunday (the school week never includes it) so the
// strip always has something selected.
export function todayKey(now: Date): DayKey {
  return JS_DAY_TO_KEY[now.getDay()] ?? 'mon';
}

function minutesOfDay(hhmm: string | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// "HH:mm" end time, wrapping past midnight like a clock would.
export function slotEnd(startTime: string | undefined, duration: number): string | null {
  const start = minutesOfDay(startTime);
  if (start === null) return null;
  const end = (start + duration) % (24 * 60);
  return `${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m)} ${suffix}`;
}

// e.g. "9:00 AM – 9:45 AM"; falls back to the bare start time if it can't be parsed.
export function formatTimeRange(startTime: string | undefined, duration: number): string {
  const end = slotEnd(startTime, duration);
  if (!startTime || end === null) return startTime ?? '';
  return `${to12h(startTime)} – ${to12h(end)}`;
}

export function slotsForDay<T extends SlotLike>(slots: T[], day: DayKey): T[] {
  return slots
    .filter((s) => (s.days ?? []).includes(day))
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
}

export function daysWithSlots(slots: SlotLike[]): Set<DayKey> {
  const set = new Set<DayKey>();
  for (const s of slots) for (const d of s.days ?? []) if ((DAY_KEYS as readonly string[]).includes(d)) set.add(d as DayKey);
  return set;
}

export type SlotStatus = 'now' | 'next' | 'later' | 'done';

// Status of each of TODAY's slots (already sorted by start): the one under way is
// 'now', the first one still to start is 'next'. Pass day === todayKey(now) only;
// other days have no status.
export function slotStatuses(daySlots: SlotLike[], now: Date): Record<string, SlotStatus> {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const out: Record<string, SlotStatus> = {};
  let nextAssigned = false;
  for (const s of daySlots) {
    const start = minutesOfDay(s.startTime);
    if (start === null) {
      out[s.id] = 'later';
      continue;
    }
    const end = start + s.duration;
    if (minutesNow >= end) out[s.id] = 'done';
    else if (minutesNow >= start) out[s.id] = 'now';
    else if (!nextAssigned) {
      out[s.id] = 'next';
      nextAssigned = true;
    } else out[s.id] = 'later';
  }
  return out;
}

// A stable accent per subject so the same subject keeps its colour all week.
const PALETTE = [
  'bg-sky-50 border-sky-400 text-sky-900 dark:bg-sky-900/20 dark:border-sky-500 dark:text-sky-100',
  'bg-violet-50 border-violet-400 text-violet-900 dark:bg-violet-900/20 dark:border-violet-500 dark:text-violet-100',
  'bg-emerald-50 border-emerald-400 text-emerald-900 dark:bg-emerald-900/20 dark:border-emerald-500 dark:text-emerald-100',
  'bg-amber-50 border-amber-400 text-amber-900 dark:bg-amber-900/20 dark:border-amber-500 dark:text-amber-100',
  'bg-rose-50 border-rose-400 text-rose-900 dark:bg-rose-900/20 dark:border-rose-500 dark:text-rose-100',
  'bg-teal-50 border-teal-400 text-teal-900 dark:bg-teal-900/20 dark:border-teal-500 dark:text-teal-100',
] as const;

export function subjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
