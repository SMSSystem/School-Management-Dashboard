// The redesigned Schedule page (spec §4, PR B): its wording, what a lesson card and the day chips show, and source
// pins on its reads and its rules (no Term picker, no live listener, the student scope, who may edit).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import pageRaw from "../../scenes/(dashboard)/schedule/index.tsx?raw";
import pageHookRaw from "../../scenes/(dashboard)/schedule/useSchedulePage.ts?raw";
import LessonCard from "../../scenes/(dashboard)/schedule/LessonCard";
import ScheduleDayChips from "../../scenes/(dashboard)/schedule/ScheduleDayChips";
import {
  blockOffNote,
  dayOffLabel,
  edgeNote,
  lessonCountLabel,
  nothingActiveLabel,
  timeLabel,
  weekRangeLabel,
} from "../../scenes/(dashboard)/schedule/scheduleLabels";
import type { WeekDay } from "../schedule/weekSchedule";
import {
  edgeNoteFor,
  emptyState,
  emptyWeekMessage,
  viewTitle,
  type EmptyInput,
} from "../../scenes/(dashboard)/schedule/schedulePageView";
import { flat } from "./sourceText";

describe("the Schedule page's wording", () => {
  it("dates and times", () => {
    expect(weekRangeLabel("2026-11-23", "2026-11-27")).toBe("23–27 Nov 2026");
    expect(weekRangeLabel("2026-11-30", "2026-12-04")).toBe(
      "30 Nov – 4 Dec 2026",
    );
    expect(weekRangeLabel("2026-12-28", "2027-01-01")).toBe(
      "28 Dec 2026 – 1 Jan 2027",
    );
    expect(timeLabel("08:05")).toBe("8:05 AM");
    expect(timeLabel("12:30")).toBe("12:30 PM");
    expect(timeLabel("00:15")).toBe("12:15 AM");
    expect(lessonCountLabel(1)).toBe("1 lesson this week.");
    expect(lessonCountLabel(12)).toBe("12 lessons this week.");
    expect(edgeNote("after", "2027-07-02")).toBe(
      "The timetable after 2 July isn't available here.",
    );
  });

  it("follows the calendar mode (D18)", () => {
    expect(dayOffLabel({ kind: "between" }, "academic")).toBe("Term break");
    expect(dayOffLabel({ kind: "between" }, "custom")).toBe(
      "No time block running",
    );
    expect(
      dayOffLabel({ kind: "nonSchool", reason: "Heroes Day" }, "academic"),
    ).toBe("Heroes Day");
    expect(nothingActiveLabel("academic")).toMatch(/^No term is active/);
    expect(nothingActiveLabel("custom")).toMatch(/^No time block is active/);
    expect(blockOffNote("Mechanical Workshop 1", "Heroes Day")).toBe(
      "Mechanical Workshop 1: no class, Heroes Day",
    );
  });
});

const slot = {
  id: "s1",
  termId: "t1",
  subjectName: "Mathematics",
  teacherName: "Delroy Brown",
  className: "Grade 5A",
  room: "Lab 2",
  days: ["mon"],
  startTime: "08:30",
  duration: 40,
};

function card(over: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(LessonCard, {
      cell: { slot, end: "09:10", now: false, clash: true },
      start: "08:30",
      rowEnd: "09:10",
      viewBy: "class",
      showClash: true,
      showTermName: false,
      ...over,
    }),
  );
}

describe("a lesson card", () => {
  it("names the teacher in a class view and the class in a teacher view", () => {
    expect(card()).toContain("Delroy Brown");
    expect(card({ viewBy: "teacher" })).toContain("Grade 5A");
    expect(card({ viewBy: "teacher" })).not.toContain("Delroy Brown");
  });

  it("tags a clash for staff only (D10)", () => {
    expect(card()).toContain(">Clash<");
    expect(card({ showClash: false })).not.toContain(">Clash<");
    expect(card({ showClash: false })).not.toContain("clashes");
  });

  it("marks the lesson on now, in its accessible name too", () => {
    const html = card({
      cell: { slot, end: "09:10", now: true, clash: false },
    });
    expect(html).toContain(">On now<");
    expect(html).toMatch(/aria-label="[^"]*, on now"/);
  });

  it("shows its own time only when it differs from its row", () => {
    expect(card()).not.toContain("8:30 AM – 9:10 AM</div>");
    expect(card({ rowEnd: "09:00" })).toContain("8:30 AM – 9:10 AM</div>");
  });
});

const day = (date: string, over: Partial<WeekDay> = {}): WeekDay => ({
  date,
  key: "mon",
  weekday: "Mon",
  label: "",
  today: false,
  teachingTermIds: ["t1"],
  off: null,
  notes: [],
  ...over,
});

describe("the day chips", () => {
  it("keep 'selected' and 'today' as two separate states", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleDayChips, {
        days: [
          day("2026-11-23"),
          day("2026-11-24", { weekday: "Tue", today: true }),
          day("2026-11-25", {
            weekday: "Wed",
            off: { kind: "nonSchool", reason: "Heroes Day" },
          }),
        ],
        selected: "2026-11-23",
        withClasses: new Set(["2026-11-23"]),
        mode: "academic",
        onSelect: () => {},
      }),
    );
    expect(html).toContain('aria-label="Day of the week"');
    expect(html).toContain(
      'aria-pressed="true" aria-label="Monday 23 November, has classes"',
    );
    expect(html).toContain(
      'aria-pressed="false" aria-label="Tuesday 24 November (today)"',
    );
    expect(html).toContain(
      'aria-label="Wednesday 25 November, no school: Heroes Day"',
    );
  });
});

describe("the page's reads and rules (source)", () => {
  const page = flat(pageRaw);
  const hook = flat(pageHookRaw);

  it("has no Term picker and leaves the app-wide current term alone (D5)", () => {
    expect(page + hook).not.toContain('aria-label="Term"');
    expect(page + hook).not.toContain("useCurrentTerm");
  });

  it("reads the week once and caches it: no live listener (§5)", () => {
    expect(page + hook).not.toContain("onSnapshot");
    expect(hook).toContain(
      flat("useWeekTimetable(staffOfState(state.of), weekTermIds)"),
    );
    // A student's or parent's week reads only the student's own classes (the student scope rule, spec §4).
    expect(hook).toContain(
      flat("useClassTimetable(studentView ? membership : null, weekTermIds)"),
    );
    expect(hook).toContain(
      flat(
        'return of && of.by !== "student" ? { by: of.by, id: of.id } : null;',
      ),
    );
  });

  it("loads each people list only for the roles that use it", () => {
    expect(hook).toContain(
      flat("useInstitutionClasses({ enabled: isAdminLike || isSenior })"),
    );
    expect(hook).toContain(
      flat("useTeachingStaff({ enabled: live && isAdminLike })"),
    );
    expect(hook).toContain(
      flat("useInstitutionSubjects({ enabled: isSenior })"),
    );
  });

  it("lets an admin edit every slot and a senior teacher only their own department's", () => {
    expect(hook).toContain(
      flat('if (role === "institution_admin") return true;'),
    );
    expect(hook).toContain(
      flat("return !!teacherId && deptIds.has(teacherId);"),
    );
    expect(hook).toContain(
      flat(
        "useDepartmentTeachers(department, { enabled: isSenior && mayEdit })",
      ),
    );
    expect(page).toContain(flat("page.canEditSlot(cell.slot) ?"));
    expect(page).toContain("showClash={staff}");
  });

  it("calls the editor 'Add slot', never 'Add lesson' (the future Lessons feature)", () => {
    expect(page).toContain('triggerLabel="Add slot"');
    expect(page).not.toContain("Add lesson");
  });
});

describe("the page's title and empty states", () => {
  const choices = {
    canChoose: true,
    initial: null,
    classes: [{ id: "c5a", name: "Grade 5A" }],
    teachers: [{ id: "u1", name: "Delroy Brown" }],
  };

  it("names the view", () => {
    expect(
      viewTitle({ by: "class", id: "c5a" }, choices, "spectator", undefined),
    ).toBe("Grade 5A");
    expect(
      viewTitle(
        { by: "teacher", id: "u1" },
        choices,
        "institution_admin",
        undefined,
      ),
    ).toBe("Delroy Brown");
    expect(
      viewTitle({ by: "student", id: "s1" }, choices, "student", undefined),
    ).toBe("Your timetable");
    expect(
      viewTitle({ by: "student", id: "k1" }, choices, "parent", "Jordan"),
    ).toBe("Jordan's timetable");
  });

  const base: EmptyInput = {
    role: "institution_admin",
    of: { by: "class", id: "c5a" },
    childrenLoading: false,
    childCount: 0,
    childName: undefined,
    bounds: { start: "2026-09-07", end: "2027-07-02" },
    mode: "academic",
    loading: false,
    error: false,
  };

  it("draws the week when there is something to draw", () => {
    expect(emptyState(base)).toBeNull();
  });

  it("explains each empty case, in order", () => {
    expect(emptyState({ ...base, role: "super_admin" })?.text).toMatch(
      /Choose an institution/,
    );
    expect(emptyState({ ...base, role: "student", of: null })?.text).toMatch(
      /not assigned to a class/,
    );
    expect(emptyState({ ...base, role: "parent", of: null })?.text).toMatch(
      /No linked children/,
    );
    expect(
      emptyState({
        ...base,
        role: "parent",
        of: null,
        childCount: 1,
        childName: "Jordan",
      })?.text,
    ).toBe("Jordan is not assigned to a class yet.");
    expect(emptyState({ ...base, bounds: null })?.text).toMatch(
      /^No term is active/,
    );
    expect(emptyState({ ...base, bounds: null, mode: "custom" })?.text).toMatch(
      /^No time block is active/,
    );
    expect(emptyState({ ...base, error: true })).toEqual({
      text: "Could not load the timetable. Please refresh and try again.",
      tone: "error",
    });
  });

  it("notes the edge of the year beside a disabled arrow (D14)", () => {
    const bounds = { start: "2026-09-07", end: "2027-07-02" };
    const week = { atStart: false, atEnd: true } as Parameters<
      typeof edgeNoteFor
    >[0];
    expect(edgeNoteFor(week, bounds)).toBe(
      "The timetable after 2 July isn't available here.",
    );
    expect(edgeNoteFor({ ...week, atEnd: false }, bounds)).toBeNull();
  });
});

describe("an empty week's message", () => {
  const wk = (days: WeekDay[]) =>
    ({ days, lessonCount: 0 }) as unknown as Parameters<
      typeof emptyWeekMessage
    >[0];
  const between = { kind: "between" as const };

  it("names a break when every day is off", () => {
    expect(
      emptyWeekMessage(
        wk([
          day("2026-12-21", { off: between }),
          day("2026-12-22", { off: between }),
        ]),
        "academic",
      ),
    ).toBe("No school this week: Term break.");
    expect(
      emptyWeekMessage(wk([day("2026-12-21", { off: between })]), "custom"),
    ).toBe("No school this week: No time block running.");
  });

  it("lists each reason once, in order", () => {
    expect(
      emptyWeekMessage(
        wk([
          day("2026-10-19", {
            off: { kind: "nonSchool", reason: "Heroes Day" },
          }),
          day("2026-10-20", { off: between }),
          day("2026-10-21", { off: between }),
        ]),
        "academic",
      ),
    ).toBe("No school this week: Heroes Day, Term break.");
  });

  it("says nothing is scheduled when some days are school days", () => {
    expect(
      emptyWeekMessage(
        wk([day("2026-11-23"), day("2026-11-24", { off: between })]),
        "academic",
      ),
    ).toBe("Nothing is scheduled this week.");
  });
});
