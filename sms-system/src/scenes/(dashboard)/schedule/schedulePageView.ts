// The Schedule page's decisions that are not layout, kept pure so they are tested without React: the view's title,
// which empty state (if any) replaces the timetable, the note at the edge of the bounds, and the days with classes.

import type { Role } from "@/lib/firebase";
import type { ScheduleChoices } from "@/lib/schedule/scheduleChoices";
import type {
  CalendarMode,
  DateRange,
  ScheduleOf,
  ScheduleSlot,
  WeekSchedule,
} from "@/lib/schedule/weekSchedule";
import {
  SCHEDULE_TEXT,
  dayOffLabel,
  edgeNote,
  nothingActiveLabel,
} from "./scheduleLabels";

/** The view's own title: the class, the teacher, "Your timetable" or "Jordan's timetable". */
export function viewTitle(
  of: ScheduleOf | null,
  choices: ScheduleChoices,
  role: Role | null | undefined,
  childName: string | undefined,
): string | undefined {
  if (of?.by === "class")
    return choices.classes.find((c) => c.id === of.id)?.name;
  if (of?.by === "teacher")
    return choices.teachers.find((t) => t.id === of.id)?.name;
  if (role === "parent")
    return SCHEDULE_TEXT.childTimetable(childName ?? "Your child");
  if (role === "student") return SCHEDULE_TEXT.yourTimetable;
  return undefined;
}

export type EmptyInput = {
  role: Role | null | undefined;
  of: ScheduleOf | null;
  childrenLoading: boolean;
  childCount: number;
  childName: string | undefined;
  bounds: DateRange | null;
  mode: CalendarMode;
  loading: boolean;
  error: boolean;
};

export type EmptyState = { text: string; tone: "muted" | "error" };

const muted = (text: string): EmptyState => ({ text, tone: "muted" });

function parentEmpty(input: EmptyInput): EmptyState {
  if (input.childrenLoading) return muted(SCHEDULE_TEXT.loading);
  if (input.childCount === 0) return muted(SCHEDULE_TEXT.noChildren);
  return muted(SCHEDULE_TEXT.childNoClass(input.childName ?? "Your child"));
}

/** What replaces the timetable, in order of precedence; null when the week can be drawn. */
export function emptyState(input: EmptyInput): EmptyState | null {
  if (input.role === "super_admin")
    return muted(SCHEDULE_TEXT.chooseInstitution);
  if (input.role === "student" && !input.of)
    return muted(SCHEDULE_TEXT.noClassStudent);
  if (input.role === "parent" && !input.of) return parentEmpty(input);
  if (!input.bounds)
    return muted(
      input.loading ? SCHEDULE_TEXT.loading : nothingActiveLabel(input.mode),
    );
  if (!input.of) return muted(SCHEDULE_TEXT.nothingToShow);
  if (input.error) return { text: SCHEDULE_TEXT.loadError, tone: "error" };
  if (input.loading) return muted(SCHEDULE_TEXT.loading);
  return null;
}

/** The note beside a disabled arrow, at the first or last week inside the bounds (D14). */
export function edgeNoteFor<S extends ScheduleSlot>(
  week: WeekSchedule<S>,
  bounds: DateRange | null,
): string | null {
  if (!bounds) return null;
  if (week.atStart) return edgeNote("before", bounds.start);
  if (week.atEnd) return edgeNote("after", bounds.end);
  return null;
}

/** The dates of the week with at least one lesson (their day chips get a dot). */
export function datesWithClasses<S extends ScheduleSlot>(
  week: WeekSchedule<S>,
): Set<string> {
  return new Set(
    week.days
      .filter((d) =>
        week.rows.some(
          (r) => r.kind === "lessons" && week.at(d.date, r.start).length > 0,
        ),
      )
      .map((d) => d.date),
  );
}

/**
 * The message for a week with no lessons: when every shown day is off, the reasons (a break or holidays, in order,
 * each once), so the Week view names a break as the Day view does; otherwise "Nothing is scheduled this week."
 */
export function emptyWeekMessage<S extends ScheduleSlot>(
  week: WeekSchedule<S>,
  mode: CalendarMode,
): string {
  const offs = week.days.map((d) => d.off);
  if (offs.length === 0 || offs.some((o) => o === null))
    return SCHEDULE_TEXT.nothingThisWeek;
  const reasons = [...new Set(offs.map((o) => dayOffLabel(o!, mode)))].join(
    ", ",
  );
  return `No school this week: ${reasons}.`;
}
