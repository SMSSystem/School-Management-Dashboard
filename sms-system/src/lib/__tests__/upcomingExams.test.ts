import { describe, expect, it } from "vitest";
import type { ExamListDoc } from "../examStudentRows";
import { upcomingExams } from "../upcomingExams";

// The student dashboard's "Upcoming exam" card: which exams it lists and in what order.

const HOUR = 3_600_000;
// Plain exams are read in device time, so the clock is built in device time too.
const NOW = new Date(2026, 10, 17, 10, 0, 0).getTime();
const ts = (ms: number) => ({ toMillis: () => ms });
const me = { classId: "c1" };

const plain = (over: Partial<ExamListDoc> = {}): ExamListDoc => ({
  id: "p",
  classId: "c1",
  subjectId: "s1",
  subjectName: "Maths",
  date: "2026-11-19",
  startTime: "09:00",
  ...over,
});

const online = (over: Partial<ExamListDoc> = {}): ExamListDoc => ({
  id: "o",
  classId: "c1",
  subjectId: "s1",
  subjectName: "English",
  title: "Unit 3 test",
  date: "2026-11-17",
  online: true,
  status: "published",
  opensAt: ts(NOW + 2 * HOUR),
  closesAt: ts(NOW + 4 * HOUR),
  ...over,
});

const ids = (
  exams: ExamListDoc[],
  membership: typeof me | Record<string, unknown> = me,
) => upcomingExams(exams, membership, NOW).map((e) => e.id);

describe("upcomingExams", () => {
  it("keeps exams starting within seven days and drops later and past ones", () => {
    expect(
      ids([
        plain({ id: "in-2-days" }),
        plain({ id: "day-7", date: "2026-11-24", startTime: "09:00" }),
        plain({ id: "day-8", date: "2026-11-25" }),
        plain({ id: "yesterday", date: "2026-11-16" }),
        plain({ id: "earlier-today", date: "2026-11-17", startTime: "08:00" }),
      ]),
    ).toEqual(["in-2-days", "day-7"]);
  });

  it("keeps a plain exam today with no start time, and one still within its duration", () => {
    expect(
      ids([
        plain({
          id: "today-no-time",
          date: "2026-11-17",
          startTime: undefined,
        }),
        plain({
          id: "running",
          date: "2026-11-17",
          startTime: "09:30",
          duration: 60,
        }),
        plain({
          id: "over",
          date: "2026-11-17",
          startTime: "08:00",
          duration: 60,
        }),
      ]),
    ).toEqual(["today-no-time", "running"]);
  });

  it("puts an open online exam first and flags it, and drops closed ones", () => {
    const result = upcomingExams(
      [
        plain({ id: "later" }),
        online({
          id: "open",
          opensAt: ts(NOW - HOUR),
          closesAt: ts(NOW + HOUR),
        }),
        online({
          id: "past-window",
          opensAt: ts(NOW - 3 * HOUR),
          closesAt: ts(NOW - HOUR),
        }),
        online({ id: "closed", status: "closed" }),
        online({ id: "finalized", status: "finalized" }),
      ],
      me,
      NOW,
    );
    expect(result.map((e) => e.id)).toEqual(["open", "later"]);
    expect(result[0]).toMatchObject({
      openNow: true,
      online: true,
      title: "Unit 3 test",
    });
  });

  it("uses the opening time of an online exam and includes drafts", () => {
    const [draft] = upcomingExams(
      [online({ id: "draft", status: "draft" })],
      me,
      NOW,
    );
    expect(draft).toMatchObject({
      id: "draft",
      openNow: false,
      startMs: NOW + 2 * HOUR,
      hasTime: true,
    });
  });

  it("keeps only the student's classes and the subjects they take in an extra class", () => {
    const membership = {
      classId: "c1",
      classIds: ["c1", "c2"],
      classSubjects: { c2: ["sA"] },
    };
    expect(
      ids(
        [
          plain({ id: "home" }),
          plain({ id: "not-mine", classId: "c9" }),
          plain({ id: "extra-taken", classId: "c2", subjectId: "sA" }),
          plain({ id: "extra-not-taken", classId: "c2", subjectId: "sB" }),
        ],
        membership,
      ),
    ).toEqual(["home", "extra-taken"]);
  });

  it("sorts soonest first, honours the limit, and falls back to the subject name for the title", () => {
    const exams = [1, 3, 2, 5, 4].map((d) =>
      plain({ id: `d${d}`, date: `2026-11-${17 + d}`, title: undefined }),
    );
    const result = upcomingExams(exams, me, NOW, { limit: 3 });
    expect(result.map((e) => e.id)).toEqual(["d1", "d2", "d3"]);
    expect(result[0].title).toBe("Maths");
    expect(upcomingExams(exams, me, NOW, { days: 2 })).toHaveLength(2);
  });

  it("skips exams with no usable date", () => {
    expect(
      ids([
        plain({ id: "no-date", date: undefined }),
        plain({ id: "bad", date: "17/11/2026" }),
      ]),
    ).toEqual([]);
  });
});
