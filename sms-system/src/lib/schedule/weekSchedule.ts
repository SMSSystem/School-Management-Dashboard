// The Schedule page's week (docs/miscellaneous-specs/SCHEDULE_PAGE_REDESIGN_SPEC.md). Pure: no React, no Firestore.
//
// Words (D1): the TIMETABLE is the recurring weekly pattern, the `timetable_slots` documents (days, a start time and
// a length, tied to one term). The SCHEDULE is that pattern laid on real dates, which is what this module builds.
// A lesson is one slot on one date; it is computed here and never stored.
//
// Rows (D4): there are no periods in this app, so the rows are the start times actually used in the week. A future
// bell schedule (BACKLOG) would replace `rowsOf` below with the school's periods and breaks.
//
// Terms (D5, D14): the week decides the term. A lesson shows on a date only when its slot's term teaches that day.
// The calendar loaded covers only the active academic year (academic mode) or the active time blocks (custom mode),
// so the page never goes outside `bounds`.
//
// Custom mode (D16-D18): time blocks can run at the same time, each with its own school days and non-school days.
// A day is off only when no running term or block teaches; otherwise each lesson follows its own block, and the
// blocks that are off that day are listed in `notes`.

import { isoDate } from "@/lib/nextClass";
import { DAY_KEYS, type DayKey } from "@/lib/scheduleDay";

/** Whose week: a class's, a teacher's, or a student's merged week (students and parents only, D15). */
export type ScheduleOf = { by: "class" | "teacher" | "student"; id: string };

export type CalendarMode = "academic" | "custom";

export type DateRange = { start: string; end: string };

/** A term (academic mode) or a time block (custom mode), with its own year's school days and non-school days. */
export type ScheduleTerm = {
  id: string;
  name: string;
  start: string;
  end: string;
  /** Mon = 1 … Sat = 6 (Sunday is never a school day here). */
  schoolWeekDays: number[];
  nonSchool: (DateRange & { reason: string })[];
};

export type CalendarInput = {
  mode: CalendarMode;
  terms: ScheduleTerm[];
  /** The first and last date the page may show (D14); null when no term or block is active. */
  bounds: DateRange | null;
};

/** Why a whole day has no lessons. */
export type DayOff =
  | { kind: "weekday" } // no running term meets on this weekday
  | { kind: "nonSchool"; reason: string } // a holiday or break of the term
  | { kind: "between" } // between terms or blocks
  | { kind: "outside" }; // before the first or after the last active term or block

export type WeekDay = {
  date: string;
  key: DayKey;
  /** "Mon". */
  weekday: string;
  /** "23 Nov". */
  label: string;
  today: boolean;
  /** The terms or blocks that teach on this date. */
  teachingTermIds: string[];
  /** Set when no term or block teaches on this date. */
  off: DayOff | null;
  /** Terms or blocks that are off on a day others teach (custom mode, D16). */
  notes: { termName: string; reason: string }[];
};

export type WeekRow = { kind: "lessons" | "gap"; start: string; end: string };

export type ScheduleSlot = {
  id: string;
  termId: string;
  subjectName: string;
  days?: string[];
  startTime?: string;
  duration: number;
};

export type WeekCell<S extends ScheduleSlot> = {
  slot: S;
  /** "HH:mm" end of this lesson (it can differ from its row's end). */
  end: string;
  now: boolean;
  /** Overlaps another lesson on the same date. */
  clash: boolean;
};

export type WeekSchedule<S extends ScheduleSlot> = {
  weekStart: string;
  days: WeekDay[];
  rows: WeekRow[];
  /** The lessons starting at `rowStart` on `date`, ordered by subject. */
  at: (date: string, rowStart: string) => WeekCell<S>[];
  /** Lessons that overlap another lesson. */
  clashes: number;
  lessonCount: number;
  /** Name the term or block on each card: true when lessons of two or more are shown (D17). */
  showTermNames: boolean;
  /** The first week inside the bounds: the "previous week" arrow is disabled. */
  atStart: boolean;
  /** The last week inside the bounds: the "next week" arrow is disabled. */
  atEnd: boolean;
};

/** A free stretch at least this long between rows gets its own "Free time" row. */
export const GAP_ROW_MINUTES = 15;
/** How far ahead the opening week looks for a teaching day. */
const DEFAULT_WEEK_LOOKAHEAD_DAYS = 26 * 7;

const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

// ── Dates (local "YYYY-MM-DD" strings, never toISOString, which shifts the day in the Americas) ──────────────────

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isoDate(parseIso(value)) === value;
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

/** The Monday of the week holding `iso` (a Sunday belongs to the week before it). */
export function mondayOf(iso: string): string {
  const day = parseIso(iso).getDay();
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

/** 0 = Sunday … 6 = Saturday, as Date.getDay(); school week days use the same numbers (Mon = 1 … Sat = 6). */
function weekdayOf(iso: string): number {
  return parseIso(iso).getDay();
}

const inRange = (iso: string, r: DateRange): boolean =>
  r.start <= iso && iso <= r.end;

function minutesOf(hhmm: string | undefined): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function hhmmOf(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ── Terms and days ──────────────────────────────────────────────────────────────────────────────────────────────

/** The ids of the terms or blocks whose dates overlap the week starting on Monday `weekStart`. */
export function termsCovering(
  weekStart: string,
  calendar: CalendarInput,
): string[] {
  const week = { start: weekStart, end: addDays(weekStart, 5) };
  return calendar.terms
    .filter((t) => t.start <= week.end && t.end >= week.start)
    .map((t) => t.id);
}

type DayInfo = Pick<WeekDay, "teachingTermIds" | "off" | "notes">;

function nonSchoolReason(term: ScheduleTerm, iso: string): string | null {
  return term.nonSchool.find((r) => inRange(iso, r))?.reason ?? null;
}

/** Which terms teach on `iso`, and if none, why the day is off. */
export function dayInfo(iso: string, calendar: CalendarInput): DayInfo {
  const weekday = weekdayOf(iso);
  const covering = calendar.terms.filter((t) => inRange(iso, t));
  const meeting = covering.filter((t) => t.schoolWeekDays.includes(weekday));
  const teaching = meeting.filter((t) => nonSchoolReason(t, iso) === null);
  const offMeeting = meeting.filter((t) => nonSchoolReason(t, iso) !== null);

  if (teaching.length > 0) {
    return {
      teachingTermIds: teaching.map((t) => t.id),
      off: null,
      notes: offMeeting.map((t) => ({
        termName: t.name,
        reason: nonSchoolReason(t, iso) ?? "",
      })),
    };
  }
  let off: DayOff;
  if (offMeeting.length > 0)
    off = {
      kind: "nonSchool",
      reason: nonSchoolReason(offMeeting[0], iso) ?? "",
    };
  else if (covering.length > 0) off = { kind: "weekday" };
  else if (calendar.bounds && inRange(iso, calendar.bounds))
    off = { kind: "between" };
  else off = { kind: "outside" };
  return { teachingTermIds: [], off, notes: [] };
}

/** Is anything taught on `iso`? */
export function isTeachingDate(iso: string, calendar: CalendarInput): boolean {
  return dayInfo(iso, calendar).teachingTermIds.length > 0;
}

/** `weekStart`'s Monday, kept inside the bounds. */
export function clampWeek(weekStart: string, calendar: CalendarInput): string {
  const monday = mondayOf(weekStart);
  if (!calendar.bounds) return monday;
  const first = mondayOf(calendar.bounds.start);
  const last = mondayOf(calendar.bounds.end);
  if (monday < first) return first;
  if (monday > last) return last;
  return monday;
}

/**
 * The week the page opens on and "Today" returns to: this week, or the next week with a teaching day when none is
 * left this week (a weekend, a break), kept inside the bounds.
 */
export function defaultWeek(today: string, calendar: CalendarInput): string {
  let iso =
    calendar.bounds && today < calendar.bounds.start
      ? calendar.bounds.start
      : today;
  for (let i = 0; i < DEFAULT_WEEK_LOOKAHEAD_DAYS; i++, iso = addDays(iso, 1)) {
    if (calendar.bounds && iso > calendar.bounds.end) break;
    if (isTeachingDate(iso, calendar)) return clampWeek(iso, calendar);
  }
  return clampWeek(today, calendar);
}

// ── The week ────────────────────────────────────────────────────────────────────────────────────────────────────

type Lesson<S extends ScheduleSlot> = {
  slot: S;
  date: string;
  start: number;
  end: number;
};

function weekDays(
  weekStart: string,
  showSaturday: boolean,
  calendar: CalendarInput,
  today: string,
): WeekDay[] {
  const count = showSaturday ? 6 : 5;
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(weekStart, i);
    const d = parseIso(date);
    return {
      date,
      key: DAY_KEYS[i],
      weekday: WEEKDAY_SHORT[d.getDay()],
      label: `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`,
      today: date === today,
      ...dayInfo(date, calendar),
    };
  });
}

/** A row's displayed end: its lessons' most common end, the earlier on a tie. */
function commonEnd(ends: number[]): number {
  const counts = new Map<number, number>();
  for (const e of ends) counts.set(e, (counts.get(e) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/**
 * The rows: one per distinct start time, ending at its lessons' most common end. A "Free time" row is added only when
 * no lesson of the week is still running: the gap starts at the latest end of every lesson started so far (`busyUntil`),
 * so a double lesson on one day never shows as free time (rows are shared by every day of the week).
 */
function rowsOf<S extends ScheduleSlot>(lessons: Lesson<S>[]): WeekRow[] {
  const endsByStart = new Map<number, number[]>();
  for (const l of lessons)
    endsByStart.set(l.start, [...(endsByStart.get(l.start) ?? []), l.end]);
  const starts = [...endsByStart.keys()].sort((a, b) => a - b);
  const rows: WeekRow[] = [];
  let busyUntil = -1;
  starts.forEach((start, i) => {
    const ends = endsByStart.get(start) ?? [];
    busyUntil = Math.max(busyUntil, ...ends);
    rows.push({
      kind: "lessons",
      start: hhmmOf(start),
      end: hhmmOf(commonEnd(ends)),
    });
    const next = starts[i + 1];
    if (next !== undefined && next - busyUntil >= GAP_ROW_MINUTES) {
      rows.push({ kind: "gap", start: hhmmOf(busyUntil), end: hhmmOf(next) });
    }
  });
  return rows;
}

/** Does the slot have a lesson on this day: its term teaches that date, and it meets on that weekday? */
function meetsOn(slot: ScheduleSlot, day: WeekDay): boolean {
  return (
    day.teachingTermIds.includes(slot.termId) &&
    (slot.days ?? []).includes(day.key)
  );
}

/** The week's lessons: each slot on each day it meets, skipping slots without a usable start time. */
function lessonsOf<S extends ScheduleSlot>(
  slots: S[],
  days: WeekDay[],
): Lesson<S>[] {
  const lessons: Lesson<S>[] = [];
  for (const day of days) {
    for (const slot of slots) {
      const start = minutesOf(slot.startTime);
      if (start !== null && meetsOn(slot, day)) {
        lessons.push({
          slot,
          date: day.date,
          start,
          end: start + slot.duration,
        });
      }
    }
  }
  return lessons;
}

/** Lessons whose times overlap another lesson's on the same date (touching end to start is not a clash). */
function clashingOf<S extends ScheduleSlot>(
  lessons: Lesson<S>[],
): Set<Lesson<S>> {
  const clashing = new Set<Lesson<S>>();
  lessons.forEach((a, i) => {
    for (const b of lessons.slice(i + 1)) {
      if (a.date === b.date && a.start < b.end && b.start < a.end) {
        clashing.add(a);
        clashing.add(b);
      }
    }
  });
  return clashing;
}

/** The cells, keyed by "date|HH:mm" of their row's start, each ordered by subject. */
function cellsOf<S extends ScheduleSlot>(
  lessons: Lesson<S>[],
  now: Date,
): Map<string, WeekCell<S>[]> {
  const today = isoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const clashing = clashingOf(lessons);
  const cells = new Map<string, WeekCell<S>[]>();
  for (const l of lessons) {
    const key = `${l.date}|${hhmmOf(l.start)}`;
    const running =
      l.date === today && l.start <= nowMinutes && nowMinutes < l.end;
    cells.set(key, [
      ...(cells.get(key) ?? []),
      {
        slot: l.slot,
        end: hhmmOf(l.end),
        now: running,
        clash: clashing.has(l),
      },
    ]);
  }
  for (const list of cells.values())
    list.sort((a, b) => a.slot.subjectName.localeCompare(b.slot.subjectName));
  return cells;
}

/** Saturday shows when a term meets on Saturdays or a slot uses it; Sunday never does. */
function showsSaturday(
  slots: ScheduleSlot[],
  calendar: CalendarInput,
): boolean {
  return (
    calendar.terms.some((t) => t.schoolWeekDays.includes(6)) ||
    slots.some((s) => (s.days ?? []).includes("sat"))
  );
}

/** One line of the day view: a time row with that day's lessons, or a free stretch between them. */
export type DayItem<S extends ScheduleSlot> =
  | { kind: "lessons"; row: WeekRow; cells: WeekCell<S>[] }
  | { kind: "gap"; start: string; end: string };

/**
 * The day view of one date: only the rows that have lessons on that day, with "Free time" between them when no
 * lesson of that day is still running (the same rule as the week's gap rows, applied to one day).
 */
export function dayItems<S extends ScheduleSlot>(
  week: WeekSchedule<S>,
  date: string,
): DayItem<S>[] {
  const items: DayItem<S>[] = [];
  let busyUntil: number | null = null;
  for (const row of week.rows) {
    if (row.kind !== "lessons") continue;
    const cells = week.at(date, row.start);
    if (cells.length === 0) continue;
    const start = minutesOf(row.start) ?? 0;
    if (busyUntil !== null && start - busyUntil >= GAP_ROW_MINUTES)
      items.push({ kind: "gap", start: hhmmOf(busyUntil), end: row.start });
    const ends = cells.map((c) => minutesOf(c.end) ?? start);
    busyUntil = Math.max(busyUntil ?? start, ...ends);
    items.push({ kind: "lessons", row, cells });
  }
  return items;
}

/** Build one week of a timetable. `slots` are the slots of the viewed class, teacher or student. */
export function buildWeek<S extends ScheduleSlot>(
  slots: S[],
  weekStart: string,
  calendar: CalendarInput,
  now: Date,
): WeekSchedule<S> {
  const monday = mondayOf(weekStart);
  const days = weekDays(
    monday,
    showsSaturday(slots, calendar),
    calendar,
    isoDate(now),
  );
  const lessons = lessonsOf(slots, days);
  const cells = cellsOf(lessons, now);
  const bounds = calendar.bounds;
  return {
    weekStart: monday,
    days,
    rows: rowsOf(lessons),
    at: (date, rowStart) => cells.get(`${date}|${rowStart}`) ?? [],
    clashes: [...cells.values()].flat().filter((c) => c.clash).length,
    lessonCount: lessons.length,
    showTermNames: new Set(lessons.map((l) => l.slot.termId)).size > 1,
    atStart: !bounds || monday <= mondayOf(bounds.start),
    atEnd: !bounds || monday >= mondayOf(bounds.end),
  };
}
