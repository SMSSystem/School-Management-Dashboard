import { describe, expect, it } from "vitest";
import {
  parseScheduleUrl,
  scheduleUrlPatch,
  type ScheduleUrlContext,
} from "../schedule/scheduleUrl";
import type { ScheduleChoices } from "../schedule/scheduleChoices";
import type { CalendarInput } from "../schedule/weekSchedule";

const calendar: CalendarInput = {
  mode: "academic",
  terms: [
    {
      id: "t1",
      name: "Christmas Term",
      start: "2026-09-07",
      end: "2026-12-18",
      schoolWeekDays: [1, 2, 3, 4, 5],
      nonSchool: [
        {
          start: "2026-10-19",
          end: "2026-10-19",
          reason: "National Heroes Day",
        },
      ],
    },
  ],
  bounds: { start: "2026-09-07", end: "2026-12-18" },
};

const adminChoices: ScheduleChoices = {
  canChoose: true,
  initial: { by: "class", id: "c2a" },
  classes: [
    { id: "c2a", name: "Grade 2A" },
    { id: "c5a", name: "Grade 5A" },
  ],
  teachers: [{ id: "u1", name: "Andrea Campbell" }],
};
const studentChoices: ScheduleChoices = {
  canChoose: false,
  initial: { by: "student", id: "s1" },
  classes: [],
  teachers: [],
};

const ctx = (over: Partial<ScheduleUrlContext> = {}): ScheduleUrlContext => ({
  choices: adminChoices,
  calendar,
  today: "2026-11-25",
  isPhone: false,
  ...over,
});
const params = (q: string) => new URLSearchParams(q);

describe("parseScheduleUrl", () => {
  it("opens on the default week, the week view and today", () => {
    expect(parseScheduleUrl(params(""), ctx())).toEqual({
      of: { by: "class", id: "c2a" },
      weekStart: "2026-11-23",
      view: "week",
      day: "2026-11-25",
    });
  });

  it("takes a valid class or teacher from the URL", () => {
    expect(parseScheduleUrl(params("by=class&id=c5a"), ctx()).of).toEqual({
      by: "class",
      id: "c5a",
    });
    expect(parseScheduleUrl(params("by=teacher&id=u1"), ctx()).of).toEqual({
      by: "teacher",
      id: "u1",
    });
  });

  it("ignores unknown ids, by=student and bad values", () => {
    expect(parseScheduleUrl(params("by=class&id=nope"), ctx()).of).toEqual({
      by: "class",
      id: "c2a",
    });
    expect(parseScheduleUrl(params("by=student&id=s9"), ctx()).of).toEqual({
      by: "class",
      id: "c2a",
    });
    expect(parseScheduleUrl(params("by=teacher&id=c5a"), ctx()).of).toEqual({
      by: "class",
      id: "c2a",
    });
    expect(
      parseScheduleUrl(params("week=2026-13-40&view=month"), ctx()),
    ).toMatchObject({ weekStart: "2026-11-23", view: "week" });
  });

  it("never lets people who can't choose switch whose week it is", () => {
    expect(
      parseScheduleUrl(
        params("by=class&id=c5a"),
        ctx({ choices: studentChoices }),
      ).of,
    ).toEqual({
      by: "student",
      id: "s1",
    });
  });

  it("moves a week to its Monday and keeps it inside the bounds", () => {
    expect(parseScheduleUrl(params("week=2026-10-21"), ctx()).weekStart).toBe(
      "2026-10-19",
    );
    expect(parseScheduleUrl(params("week=2027-03-01"), ctx()).weekStart).toBe(
      "2026-12-14",
    );
    expect(parseScheduleUrl(params("week=2026-01-05"), ctx()).weekStart).toBe(
      "2026-09-07",
    );
  });

  it("keeps a day inside the week, else today, else the first teaching day", () => {
    expect(parseScheduleUrl(params("day=2026-11-24"), ctx()).day).toBe(
      "2026-11-24",
    );
    expect(parseScheduleUrl(params("day=2026-12-01"), ctx()).day).toBe(
      "2026-11-25",
    );
    // Week of the holiday, viewed from another week: Monday is off, so Tuesday.
    expect(parseScheduleUrl(params("week=2026-10-19"), ctx()).day).toBe(
      "2026-10-20",
    );
  });

  it("gives phones the day view", () => {
    expect(
      parseScheduleUrl(params("view=week"), ctx({ isPhone: true })).view,
    ).toBe("day");
    expect(parseScheduleUrl(params("view=day"), ctx()).view).toBe("day");
  });
});

describe("scheduleUrlPatch", () => {
  const state = {
    of: { by: "class" as const, id: "c5a" },
    weekStart: "2026-11-23",
    view: "day" as const,
    day: "2026-11-24",
  };

  it("writes the class or teacher only for people who may choose", () => {
    expect(scheduleUrlPatch(state, true)).toEqual({
      week: "2026-11-23",
      view: "day",
      day: "2026-11-24",
      by: "class",
      id: "c5a",
    });
    expect(scheduleUrlPatch(state, false)).toEqual({
      week: "2026-11-23",
      view: "day",
      day: "2026-11-24",
    });
  });

  it("never writes a student id", () => {
    expect(
      scheduleUrlPatch({ ...state, of: { by: "student", id: "s1" } }, true),
    ).not.toHaveProperty("id");
  });
});
