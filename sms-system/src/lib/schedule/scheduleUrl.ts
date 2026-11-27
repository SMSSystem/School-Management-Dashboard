// The Schedule page's state in the URL (spec §4): ?by=class|teacher&id=&week=YYYY-MM-DD&view=week|day&day=YYYY-MM-DD.
// Every value is checked, so a hand-edited or stale link falls back instead of breaking the page. Only internal ids
// go in the URL, never names; students' and parents' URLs carry no id, and `by=student` is never read from it.

import type { ScheduleChoices } from "./scheduleChoices";
import {
  addDays,
  clampWeek,
  defaultWeek,
  isIsoDate,
  isTeachingDate,
  mondayOf,
  type CalendarInput,
  type ScheduleOf,
} from "./weekSchedule";

export type ScheduleView = "week" | "day";

export type ScheduleUrlState = {
  of: ScheduleOf | null;
  /** A Monday inside the bounds. */
  weekStart: string;
  view: ScheduleView;
  /** A date inside the week (Monday to Saturday). */
  day: string;
};

export type ScheduleUrlContext = {
  choices: ScheduleChoices;
  calendar: CalendarInput;
  /** Today's local date, "YYYY-MM-DD". */
  today: string;
  /** Phones get the day view only. */
  isPhone: boolean;
};

type Params = Pick<URLSearchParams, "get">;

function chosenOf(params: Params, choices: ScheduleChoices): ScheduleOf | null {
  if (!choices.canChoose) return choices.initial;
  const by = params.get("by");
  const id = params.get("id");
  if (id && by === "class" && choices.classes.some((c) => c.id === id))
    return { by, id };
  if (id && by === "teacher" && choices.teachers.some((t) => t.id === id))
    return { by, id };
  return choices.initial;
}

function dayIn(
  weekStart: string,
  wanted: string | null,
  ctx: ScheduleUrlContext,
): string {
  const inWeek = (iso: string) =>
    iso >= weekStart && iso <= addDays(weekStart, 5);
  if (isIsoDate(wanted) && inWeek(wanted)) return wanted;
  if (inWeek(ctx.today)) return ctx.today;
  for (let i = 0; i < 6; i++) {
    const iso = addDays(weekStart, i);
    if (isTeachingDate(iso, ctx.calendar)) return iso;
  }
  return weekStart;
}

export function parseScheduleUrl(
  params: Params,
  ctx: ScheduleUrlContext,
): ScheduleUrlState {
  const week = params.get("week");
  const weekStart = isIsoDate(week)
    ? clampWeek(mondayOf(week), ctx.calendar)
    : defaultWeek(ctx.today, ctx.calendar);
  const view: ScheduleView =
    ctx.isPhone || params.get("view") === "day" ? "day" : "week";
  return {
    of: chosenOf(params, ctx.choices),
    weekStart,
    view,
    day: dayIn(weekStart, params.get("day"), ctx),
  };
}

/** The URL parameters for a state; `by` and `id` only for people who may choose. */
export function scheduleUrlPatch(
  state: ScheduleUrlState,
  canChoose: boolean,
): Record<string, string> {
  const out: Record<string, string> = {
    week: state.weekStart,
    view: state.view,
    day: state.day,
  };
  if (canChoose && state.of && state.of.by !== "student") {
    out.by = state.of.by;
    out.id = state.of.id;
  }
  return out;
}
