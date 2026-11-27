import { describe, expect, it } from "vitest";
import {
  calendarInputFrom,
  type CalendarSource,
} from "../schedule/scheduleCalendar";

const empty: CalendarSource = {
  isCustomMode: false,
  activeYear: null,
  terms: [],
  nonSchoolDays: [],
  activeTimeBlocks: [],
  nonSchoolDaysByTermId: {},
};

describe("calendarInputFrom", () => {
  it("academic mode: the active year's terms share its school days and non-school days", () => {
    const cal = calendarInputFrom({
      ...empty,
      activeYear: { schoolWeekDays: [1, 2, 3, 4, 5, 6] },
      terms: [
        {
          id: "t2",
          name: "Easter Term",
          startDate: "2027-01-04",
          endDate: "2027-04-01",
        },
        {
          id: "t1",
          name: "Christmas Term",
          startDate: "2026-09-07",
          endDate: "2026-12-18",
        },
      ],
      nonSchoolDays: [
        {
          type: "single",
          date: "2026-10-19",
          reason: "National Heroes Day",
          isActive: true,
        },
        {
          type: "range",
          startDate: "2027-02-15",
          endDate: "2027-02-19",
          reason: "Mid-term break",
          isActive: true,
        },
        {
          type: "single",
          date: "2026-11-02",
          reason: "Withdrawn",
          isActive: false,
        },
      ],
    });
    expect(cal.mode).toBe("academic");
    expect(cal.bounds).toEqual({ start: "2026-09-07", end: "2027-04-01" });
    expect(cal.terms.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(cal.terms[0].schoolWeekDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(cal.terms[1].nonSchool).toEqual([
      { start: "2026-10-19", end: "2026-10-19", reason: "National Heroes Day" },
      { start: "2027-02-15", end: "2027-02-19", reason: "Mid-term break" },
    ]);
  });

  it("academic mode with no active year has no terms and no bounds", () => {
    const cal = calendarInputFrom({
      ...empty,
      terms: [{ id: "t1", startDate: "2026-09-07", endDate: "2026-12-18" }],
    });
    expect(cal.terms).toEqual([]);
    expect(cal.bounds).toBeNull();
  });

  it("custom mode: each block keeps its own year's days and non-school days", () => {
    const cal = calendarInputFrom({
      ...empty,
      isCustomMode: true,
      activeTimeBlocks: [
        {
          year: { schoolWeekDays: [1, 3] },
          term: {
            id: "A",
            name: "Workshop 1",
            startDate: "2026-11-02",
            endDate: "2027-01-08",
          },
        },
        {
          year: { schoolWeekDays: [] },
          term: {
            id: "B",
            name: "Electrical 2",
            startDate: "2026-10-05",
            endDate: "2026-12-11",
          },
        },
      ],
      nonSchoolDaysByTermId: {
        A: [
          {
            type: "single",
            date: "2026-11-23",
            reason: "Closed",
            isActive: true,
          },
        ],
      },
    });
    expect(cal.mode).toBe("custom");
    expect(cal.bounds).toEqual({ start: "2026-10-05", end: "2027-01-08" });
    expect(cal.terms[0]).toMatchObject({
      id: "A",
      name: "Workshop 1",
      schoolWeekDays: [1, 3],
    });
    expect(cal.terms[0].nonSchool).toEqual([
      { start: "2026-11-23", end: "2026-11-23", reason: "Closed" },
    ]);
    // A year with no school days recorded falls back to Monday to Friday.
    expect(cal.terms[1].schoolWeekDays).toEqual([1, 2, 3, 4, 5]);
    expect(cal.terms[1].nonSchool).toEqual([]);
  });

  it("drops a term with missing or reversed dates", () => {
    const cal = calendarInputFrom({
      ...empty,
      activeYear: { schoolWeekDays: [1, 2, 3, 4, 5] },
      terms: [
        { id: "bad", startDate: "2026-12-18", endDate: "2026-09-07" },
        { id: "blank", startDate: "", endDate: "" },
      ],
    });
    expect(cal.terms).toEqual([]);
    expect(cal.bounds).toBeNull();
  });
});
