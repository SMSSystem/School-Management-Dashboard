// Turns useInstitutionAcademicCalendar's output into the Schedule page's CalendarInput (lib/schedule/weekSchedule.ts).
// Pure, so both calendar modes are tested without React.
//
// Academic mode: the active year's terms, all sharing that year's school days and non-school days.
// Custom mode: each active time block is a term with ITS OWN year's school days and non-school days (blocks can run at
// the same time and differ, decision D16). Only what the calendar hook loads is used, which is why the page is
// bounded to these dates (D14).

import type { CalendarInput, DateRange, ScheduleTerm } from "./weekSchedule";

type TermLike = {
  id: string;
  name?: string;
  startDate: string;
  endDate: string;
};
type YearLike = { schoolWeekDays?: number[] };
type NonSchoolLike = {
  type?: "single" | "range";
  date?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
  isActive?: boolean;
};

export type CalendarSource = {
  isCustomMode: boolean;
  /** Academic mode: the active year (its school days), or null when none is active. */
  activeYear: YearLike | null;
  /** Academic mode: the active year's terms. */
  terms: TermLike[];
  /** Academic mode: the active year's non-school days. */
  nonSchoolDays: NonSchoolLike[];
  /** Custom mode: the active time blocks, each with its year. */
  activeTimeBlocks: { year: YearLike; term: TermLike }[];
  /** Custom mode: each block's non-school days, by the block's term id. */
  nonSchoolDaysByTermId: Record<string, NonSchoolLike[]>;
};

/** The default school week when a year has none recorded: Monday to Friday. */
const MON_TO_FRI = [1, 2, 3, 4, 5];

function rangeOf(n: NonSchoolLike): (DateRange & { reason: string }) | null {
  if (n.isActive === false) return null;
  const reason = n.reason ?? "";
  if (n.type === "range" && n.startDate && n.endDate)
    return { start: n.startDate, end: n.endDate, reason };
  if (n.date) return { start: n.date, end: n.date, reason };
  return null;
}

function termOf(
  term: TermLike,
  year: YearLike | null,
  nonSchool: NonSchoolLike[],
): ScheduleTerm {
  return {
    id: term.id,
    name: term.name ?? "",
    start: term.startDate,
    end: term.endDate,
    schoolWeekDays: year?.schoolWeekDays?.length
      ? year.schoolWeekDays
      : MON_TO_FRI,
    nonSchool: nonSchool
      .map(rangeOf)
      .filter((r): r is DateRange & { reason: string } => r !== null),
  };
}

export function calendarInputFrom(source: CalendarSource): CalendarInput {
  const terms = source.isCustomMode
    ? source.activeTimeBlocks.map((b) =>
        termOf(b.term, b.year, source.nonSchoolDaysByTermId[b.term.id] ?? []),
      )
    : source.activeYear
      ? source.terms.map((t) =>
          termOf(t, source.activeYear, source.nonSchoolDays),
        )
      : [];
  const valid = terms.filter((t) => t.start && t.end && t.start <= t.end);
  const bounds = valid.length
    ? {
        start: valid.reduce(
          (min, t) => (t.start < min ? t.start : min),
          valid[0].start,
        ),
        end: valid.reduce(
          (max, t) => (t.end > max ? t.end : max),
          valid[0].end,
        ),
      }
    : null;
  return {
    mode: source.isCustomMode ? "custom" : "academic",
    terms: valid,
    bounds,
  };
}
