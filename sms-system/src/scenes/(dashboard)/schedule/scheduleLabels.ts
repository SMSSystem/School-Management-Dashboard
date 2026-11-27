// The Schedule page's wording in one place, so the tests can import it (spec §4, D18: the words follow the calendar
// mode, "term" in academic mode and "time block" in custom mode).

import type { CalendarMode, DayOff } from "@/lib/schedule/weekSchedule";

const LONG_WEEKDAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const LONG_MONTH = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT_MONTH = LONG_MONTH.map((m) => m.slice(0, 3));

function parts(iso: string): { y: number; m: number; d: number; wd: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d, wd: new Date(y, m - 1, d).getDay() };
}

/** "Monday". */
export function weekdayName(iso: string): string {
  return LONG_WEEKDAY[parts(iso).wd];
}

/** "7 September". */
export function dayMonth(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${LONG_MONTH[m]}`;
}

/** "Monday, 19 October". */
export function longDate(iso: string): string {
  return `${weekdayName(iso)}, ${dayMonth(iso)}`;
}

/** "23–27 Nov 2026", or "30 Nov – 5 Dec 2026" across months, or across years with both years. */
export function weekRangeLabel(first: string, last: string): string {
  const a = parts(first);
  const b = parts(last);
  if (a.y !== b.y)
    return `${a.d} ${SHORT_MONTH[a.m]} ${a.y} – ${b.d} ${SHORT_MONTH[b.m]} ${b.y}`;
  if (a.m !== b.m)
    return `${a.d} ${SHORT_MONTH[a.m]} – ${b.d} ${SHORT_MONTH[b.m]} ${b.y}`;
  return `${a.d}–${b.d} ${SHORT_MONTH[b.m]} ${b.y}`;
}

/** "08:30" → "8:30 AM". */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Why a whole day has no lessons, in the calendar mode's words. */
export function dayOffLabel(off: DayOff, mode: CalendarMode): string {
  switch (off.kind) {
    case "nonSchool":
      return off.reason || "No school";
    case "weekday":
      return "No classes";
    case "between":
      return mode === "custom" ? "No time block running" : "Term break";
    case "outside":
      return mode === "custom"
        ? "No time block running"
        : "Outside the school year";
  }
}

/** The empty state when nothing is active (D18). */
export function nothingActiveLabel(mode: CalendarMode): string {
  return mode === "custom"
    ? "No time block is active, so there is no timetable to show."
    : "No term is active, so there is no timetable to show.";
}

/** The note beside a disabled arrow at the edge of what can be shown (D14). */
export function edgeNote(side: "before" | "after", iso: string): string {
  return `The timetable ${side} ${dayMonth(iso)} isn't available here.`;
}

/** "1 lesson this week." / "12 lessons this week." */
export function lessonCountLabel(n: number): string {
  return `${n} ${n === 1 ? "lesson" : "lessons"} this week.`;
}

/** "1 lesson clashes with another this week." (staff only, D10). */
export function clashCountLabel(n: number): string {
  return `${n} ${n === 1 ? "lesson clashes" : "lessons clash"} with another this week.`;
}

/** A custom-mode note under a date: a block that is off on a day others teach (D16). */
export function blockOffNote(termName: string, reason: string): string {
  return `${termName || "A time block"}: no class${reason ? `, ${reason}` : ""}`;
}

export const SCHEDULE_TEXT = {
  heading: "Schedule",
  yourTimetable: "Your timetable",
  childTimetable: (name: string) => `${name}'s timetable`,
  previousWeek: "Previous week",
  nextWeek: "Next week",
  today: "Today",
  week: "Week",
  day: "Day",
  show: "Show",
  aClass: "A class",
  aTeacher: "A teacher",
  dayGroup: "Day of the week",
  childGroup: "Child",
  showing: "Showing:",
  freeTime: "Free time",
  onNow: "On now",
  clash: "Clash",
  nothingThisWeek: "Nothing is scheduled this week.",
  turnSideways: "Turn your device sideways to see the whole week.",
  loading: "Loading…",
  loadError: "Could not load the timetable. Please refresh and try again.",
  noClassStudent:
    "You are not assigned to a class yet, so there is no timetable to show. Contact your teacher.",
  noChildren: "No linked children found on your account.",
  childNoClass: (name: string) => `${name} is not assigned to a class yet.`,
  chooseInstitution: "Choose an institution to see its schedule.",
  nothingToShow: "There is no class or teacher to show yet.",
  delegate: "Delegate Schedule Access",
} as const;
