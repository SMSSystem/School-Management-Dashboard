import { beforeEach, describe, expect, it, vi } from "vitest";

type Docs = Record<string, unknown>[];
const stored: Record<string, Docs> = {};

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  where: vi.fn(() => ({})),
  query: vi.fn((collection: { name: string }) => collection),
  getDocs: vi.fn(async (collection: { name: string }) => ({
    docs: (stored[collection.name] ?? []).map((data) => ({ data: () => data })),
  })),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/queryClient", () => ({ queryClient: {} }));
vi.mock("@/lib/paths", () => ({
  institutionCollection: vi.fn((_institutionId: string, name: string) => ({
    name,
  })),
  institutionDoc: vi.fn(),
}));

const { findAttendanceOnRemovedDays } = await import("../academicCalendarSave");

// 2026-11-02 is a Monday (getUTCDay 1) and 2026-11-03 a Tuesday (2).
const MONDAY = 1;
const TUESDAY = 2;
const check = (removedDays: number[]) =>
  findAttendanceOnRemovedDays("inst1", "year1", removedDays);

describe("removing a school day that has attendance", () => {
  beforeEach(() => {
    stored.generalAttendance = [];
    stored.subjectAttendance = [];
  });

  it("is refused when a general register falls on that day", async () => {
    stored.generalAttendance = [{ date: "2026-11-02" }];
    expect(await check([MONDAY])).toEqual({
      day: MONDAY,
      exampleDate: "2026-11-02",
    });
  });

  it("is refused when a subject register falls on that day, whose date is in sessionDate", async () => {
    stored.subjectAttendance = [{ sessionDate: "2026-11-03" }];
    expect(await check([TUESDAY])).toEqual({
      day: TUESDAY,
      exampleDate: "2026-11-03",
    });
  });

  it("is allowed when the registers fall on other days", async () => {
    stored.generalAttendance = [{ date: "2026-11-02" }];
    stored.subjectAttendance = [{ sessionDate: "2026-11-02" }];
    expect(await check([TUESDAY])).toBeNull();
  });

  it("is allowed when there are no registers", async () => {
    expect(await check([MONDAY, TUESDAY])).toBeNull();
  });
});
