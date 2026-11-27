import { describe, expect, it } from "vitest";
import {
  GAP_ROW_MINUTES,
  addDays,
  buildWeek,
  clampWeek,
  dayInfo,
  defaultWeek,
  isIsoDate,
  mondayOf,
  termsCovering,
  type CalendarInput,
  type ScheduleSlot,
  type ScheduleTerm,
} from "../schedule/weekSchedule";

const MON_FRI = [1, 2, 3, 4, 5];

function term(
  id: string,
  start: string,
  end: string,
  extra: Partial<ScheduleTerm> = {},
): ScheduleTerm {
  return {
    id,
    name: id,
    start,
    end,
    schoolWeekDays: MON_FRI,
    nonSchool: [],
    ...extra,
  };
}

function calendar(
  terms: ScheduleTerm[],
  mode: CalendarInput["mode"] = "academic",
): CalendarInput {
  const bounds = terms.length
    ? {
        start: terms.map((t) => t.start).sort()[0],
        end: terms
          .map((t) => t.end)
          .sort()
          .reverse()[0],
      }
    : null;
  return { mode, terms, bounds };
}

let n = 0;
function slot(
  days: string[],
  startTime: string,
  duration: number,
  extra: Partial<ScheduleSlot> = {},
): ScheduleSlot {
  n += 1;
  return {
    id: `s${n}`,
    termId: "t1",
    subjectName: `Subject ${n}`,
    days,
    startTime,
    duration,
    ...extra,
  };
}

// 2026-11-23 is a Monday; 2026-10-19 (National Heroes Day) is a Monday.
const T1 = term("t1", "2026-09-07", "2026-12-18", {
  nonSchool: [
    { start: "2026-10-19", end: "2026-10-19", reason: "National Heroes Day" },
  ],
});
const T2 = term("t2", "2027-01-04", "2027-04-01");
const ACADEMIC = calendar([T1, T2]);
const WED_10AM = new Date(2026, 10, 25, 10, 0);

describe("dates", () => {
  it("finds the Monday of a week, with Sunday belonging to the week before", () => {
    expect(mondayOf("2026-11-25")).toBe("2026-11-23");
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("accepts only real ISO dates", () => {
    expect(isIsoDate("2026-11-23")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("23/11/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("days shown", () => {
  it("shows Monday to Friday with labels and today marked", () => {
    const week = buildWeek([], "2026-11-25", ACADEMIC, WED_10AM);
    expect(week.weekStart).toBe("2026-11-23");
    expect(week.days.map((d) => d.weekday)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
    ]);
    expect(week.days.map((d) => d.key)).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
    ]);
    expect(week.days[0].label).toBe("Nov 23");
    expect(week.days.filter((d) => d.today).map((d) => d.date)).toEqual([
      "2026-11-25",
    ]);
  });

  it("adds Saturday when a term meets on Saturdays", () => {
    const cal = calendar([
      term("t1", "2026-09-07", "2026-12-18", {
        schoolWeekDays: [1, 2, 3, 4, 5, 6],
      }),
    ]);
    const week = buildWeek([], "2026-11-23", cal, WED_10AM);
    expect(week.days.map((d) => d.weekday)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(week.days[5].off).toBeNull();
  });

  it("adds Saturday when a slot uses it, marking it off when the term does not meet then", () => {
    const week = buildWeek(
      [slot(["sat"], "09:00", 60)],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(week.days).toHaveLength(6);
    expect(week.days[5].off).toEqual({ kind: "weekday" });
    expect(week.lessonCount).toBe(0);
  });
});

describe("school days and reasons", () => {
  it("names a holiday and draws no lessons on it", () => {
    const week = buildWeek(
      [slot(["mon", "tue"], "08:30", 45)],
      "2026-10-19",
      ACADEMIC,
      WED_10AM,
    );
    expect(week.days[0].off).toEqual({
      kind: "nonSchool",
      reason: "National Heroes Day",
    });
    expect(week.at("2026-10-19", "08:30")).toEqual([]);
    expect(week.at("2026-10-20", "08:30")).toHaveLength(1);
  });

  it("marks dates between terms and before the first term differently", () => {
    expect(dayInfo("2026-12-23", ACADEMIC).off).toEqual({ kind: "between" });
    expect(dayInfo("2026-09-04", ACADEMIC).off).toEqual({ kind: "outside" });
    expect(dayInfo("2027-04-05", ACADEMIC).off).toEqual({ kind: "outside" });
  });

  it("draws each term only on its own dates in a week that spans two terms", () => {
    const cal = calendar([
      term("a", "2026-11-02", "2026-11-25"),
      term("b", "2026-11-26", "2026-12-18"),
    ]);
    const slots = [
      slot(MON_FRI_KEYS(), "08:30", 45, { termId: "a" }),
      slot(MON_FRI_KEYS(), "08:30", 45, { termId: "b" }),
    ];
    const week = buildWeek(slots, "2026-11-23", cal, WED_10AM);
    expect(week.at("2026-11-25", "08:30").map((c) => c.slot.termId)).toEqual([
      "a",
    ]);
    expect(week.at("2026-11-26", "08:30").map((c) => c.slot.termId)).toEqual([
      "b",
    ]);
    expect(week.showTermNames).toBe(true);
    expect(termsCovering("2026-11-23", cal)).toEqual(["a", "b"]);
  });
});

function MON_FRI_KEYS(): string[] {
  return ["mon", "tue", "wed", "thu", "fri"];
}

describe("custom mode: overlapping blocks (D16)", () => {
  const evening = term("A", "2026-11-02", "2026-12-18", {
    name: "Mechanical Workshop 1",
    schoolWeekDays: [1, 3],
    nonSchool: [
      { start: "2026-11-23", end: "2026-11-23", reason: "Workshop closed" },
    ],
  });
  const other = term("B", "2026-11-09", "2027-01-15", {
    name: "Electrical 2",
    schoolWeekDays: [1, 2],
  });
  const cal = calendar([evening, other], "custom");

  it("keeps a day open when another block teaches, and notes the block that is off", () => {
    const slots = [
      slot(["mon", "wed"], "18:00", 120, { termId: "A" }),
      slot(["mon", "tue"], "18:00", 120, { termId: "B" }),
    ];
    const week = buildWeek(slots, "2026-11-23", cal, WED_10AM);
    const monday = week.days[0];
    expect(monday.off).toBeNull();
    expect(monday.teachingTermIds).toEqual(["B"]);
    expect(monday.notes).toEqual([
      { termName: "Mechanical Workshop 1", reason: "Workshop closed" },
    ]);
    expect(week.at("2026-11-23", "18:00").map((c) => c.slot.termId)).toEqual([
      "B",
    ]);
    expect(week.at("2026-11-25", "18:00").map((c) => c.slot.termId)).toEqual([
      "A",
    ]);
  });

  it("greys a day only when no block teaches on it", () => {
    const thursday = dayInfo("2026-11-26", cal);
    expect(thursday.teachingTermIds).toEqual([]);
    expect(thursday.off).toEqual({ kind: "weekday" });
  });
});

describe("rows", () => {
  it("makes one row per start time, ending at the most common end", () => {
    const slots = [
      slot(["mon"], "08:30", 45),
      slot(["tue"], "08:30", 45),
      slot(["wed"], "08:30", 60),
    ];
    const week = buildWeek(slots, "2026-11-23", ACADEMIC, WED_10AM);
    expect(week.rows).toEqual([
      { kind: "lessons", start: "08:30", end: "09:15" },
    ]);
    expect(week.at("2026-11-25", "08:30")[0].end).toBe("09:30");
  });

  it("takes the earlier end on a tie", () => {
    const week = buildWeek(
      [slot(["mon"], "08:30", 60), slot(["tue"], "08:30", 45)],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(week.rows[0].end).toBe("09:15");
  });

  it(`adds a "Free time" row for gaps of ${GAP_ROW_MINUTES} minutes or more`, () => {
    const withGap = buildWeek(
      [slot(["mon"], "08:30", 45), slot(["mon"], "09:30", 45)],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(withGap.rows.map((r) => r.kind)).toEqual([
      "lessons",
      "gap",
      "lessons",
    ]);
    expect(withGap.rows[1]).toEqual({
      kind: "gap",
      start: "09:15",
      end: "09:30",
    });
    const noGap = buildWeek(
      [slot(["mon"], "08:30", 45), slot(["mon"], "09:20", 45)],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(noGap.rows.map((r) => r.kind)).toEqual(["lessons", "lessons"]);
  });

  it("never shows free time while a longer lesson on another day is still running", () => {
    // Mon 08:30-09:15, but Tue 08:30-10:00 (a double lesson), then Mon 09:30: the row ends at 09:15, yet no gap.
    const week = buildWeek(
      [
        slot(["mon"], "08:30", 45),
        slot(["wed"], "08:30", 45),
        slot(["tue"], "08:30", 90),
        slot(["mon"], "09:30", 45),
      ],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(week.rows).toEqual([
      { kind: "lessons", start: "08:30", end: "09:15" },
      { kind: "lessons", start: "09:30", end: "10:15" },
    ]);
  });

  it("starts free time only after every lesson begun so far has ended", () => {
    // 08:00-10:00 (long), 08:30-09:00, then 10:30: the gap is 10:00-10:30, not 09:00-10:30.
    const week = buildWeek(
      [
        slot(["mon"], "08:00", 120),
        slot(["tue"], "08:30", 30),
        slot(["mon"], "10:30", 45),
      ],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(week.rows).toEqual([
      { kind: "lessons", start: "08:00", end: "10:00" },
      { kind: "lessons", start: "08:30", end: "09:00" },
      { kind: "gap", start: "10:00", end: "10:30" },
      { kind: "lessons", start: "10:30", end: "11:15" },
    ]);
  });

  it("skips slots without a usable start time", () => {
    const week = buildWeek(
      [slot(["mon"], "", 45), slot(["mon"], "later", 45)],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(week.lessonCount).toBe(0);
    expect(week.rows).toEqual([]);
  });
});

describe("clashes", () => {
  it("flags lessons that overlap on the same date, even in different rows", () => {
    const a = slot(["mon"], "08:30", 60);
    const b = slot(["mon"], "09:00", 45);
    const c = slot(["tue"], "08:30", 60);
    const week = buildWeek([a, b, c], "2026-11-23", ACADEMIC, WED_10AM);
    expect(week.at("2026-11-23", "08:30")[0].clash).toBe(true);
    expect(week.at("2026-11-23", "09:00")[0].clash).toBe(true);
    expect(week.at("2026-11-24", "08:30")[0].clash).toBe(false);
    expect(week.clashes).toBe(2);
  });

  it("does not flag lessons that only touch", () => {
    const week = buildWeek(
      [slot(["mon"], "08:30", 45), slot(["mon"], "09:15", 45)],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(week.clashes).toBe(0);
  });

  it("keeps both lessons in a shared cell, ordered by subject", () => {
    const week = buildWeek(
      [
        slot(["mon"], "08:30", 45, { subjectName: "Science" }),
        slot(["mon"], "08:30", 45, { subjectName: "Art" }),
      ],
      "2026-11-23",
      ACADEMIC,
      WED_10AM,
    );
    expect(
      week.at("2026-11-23", "08:30").map((c) => c.slot.subjectName),
    ).toEqual(["Art", "Science"]);
    expect(week.lessonCount).toBe(2);
  });
});

describe("now", () => {
  const lesson = slot(["wed"], "09:30", 45);
  const at = (h: number, m: number) =>
    buildWeek(
      [lesson],
      "2026-11-23",
      ACADEMIC,
      new Date(2026, 10, 25, h, m),
    ).at("2026-11-25", "09:30")[0].now;

  it("includes the start and excludes the end", () => {
    expect(at(9, 29)).toBe(false);
    expect(at(9, 30)).toBe(true);
    expect(at(10, 14)).toBe(true);
    expect(at(10, 15)).toBe(false);
  });

  it("is never on for another day", () => {
    const week = buildWeek(
      [slot(["tue"], "09:30", 45)],
      "2026-11-23",
      ACADEMIC,
      new Date(2026, 10, 25, 9, 45),
    );
    expect(week.at("2026-11-24", "09:30")[0].now).toBe(false);
  });
});

describe("bounds (D14)", () => {
  it("keeps weeks inside the active year", () => {
    expect(clampWeek("2026-08-17", ACADEMIC)).toBe("2026-09-07");
    expect(clampWeek("2027-06-01", ACADEMIC)).toBe("2027-03-29");
    expect(clampWeek("2026-11-25", ACADEMIC)).toBe("2026-11-23");
  });

  it("marks the first and last weeks", () => {
    expect(buildWeek([], "2026-09-07", ACADEMIC, WED_10AM).atStart).toBe(true);
    expect(buildWeek([], "2026-11-23", ACADEMIC, WED_10AM).atStart).toBe(false);
    expect(buildWeek([], "2027-03-29", ACADEMIC, WED_10AM).atEnd).toBe(true);
  });

  it("treats no active term as both edges", () => {
    const week = buildWeek([], "2026-11-23", calendar([]), WED_10AM);
    expect(week.atStart && week.atEnd).toBe(true);
    expect(week.days.every((d) => d.off?.kind === "outside")).toBe(true);
  });
});

describe("default week", () => {
  it("is this week on a school day", () => {
    expect(defaultWeek("2026-11-27", ACADEMIC)).toBe("2026-11-23");
  });

  it("is next week on a weekend", () => {
    expect(defaultWeek("2026-11-28", ACADEMIC)).toBe("2026-11-30");
  });

  it("skips a break to the next term", () => {
    expect(defaultWeek("2026-12-23", ACADEMIC)).toBe("2027-01-04");
  });

  it("opens on the first week before the year starts and the last week after it ends", () => {
    expect(defaultWeek("2026-08-20", ACADEMIC)).toBe("2026-09-07");
    expect(defaultWeek("2027-05-10", ACADEMIC)).toBe("2027-03-29");
  });
});
