import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStorage } from "./fakeStorage";

// The background prefetch of today's registers (lib/offline/prefetchRegisters.ts, OFFLINE_ATTENDANCE_SPEC.md slice B):
// teachers only, once a day on each device, today's subject classes only, and it stops at the first offline sign.

const reads = vi.hoisted(() => ({
  subjects: [] as unknown[],
  studentsFromCopy: false,
  serverAnswers: true,
}));

vi.mock("@/lib/subjectsQuery", () => ({
  fetchInstitutionSubjects: vi.fn(async () => reads.subjects),
}));
vi.mock("@/lib/generalAttendanceSave", () => ({
  loadClassStudents: vi.fn(async () => ({
    value: [],
    fromCopy: reads.studentsFromCopy,
    savedAt: null,
  })),
}));
vi.mock("@/lib/subjectAttendanceSave", () => ({
  fetchEnrolledStudents: vi.fn(async () => ({
    value: [],
    fromCopy: reads.studentsFromCopy,
    savedAt: null,
  })),
}));
vi.mock("@/lib/offline/registerReads", () => ({
  generalWeek: vi.fn((_i: string, classId: string) => ({ name: classId })),
  subjectWeek: vi.fn((_i: string, subjectId: string, classId: string) => ({
    name: `${subjectId}:${classId}`,
  })),
  keepWeek: vi.fn(async () => reads.serverAnswers),
}));

const { prefetchRegisters } = await import("../offline/prefetchRegisters");
const { PREFETCH_DONE_KEY, purgeOfflineStore } =
  await import("../offline/offlineStore");
const { fetchInstitutionSubjects } = await import("@/lib/subjectsQuery");
const { loadClassStudents } = await import("@/lib/generalAttendanceSave");
const { fetchEnrolledStudents } = await import("@/lib/subjectAttendanceSave");
const { keepWeek } = await import("@/lib/offline/registerReads");

// Thursday 19 November 2026 (getUTCDay 4)
const THURSDAY = new Date("2026-11-19T14:00:00Z");
const FRIDAY = new Date("2026-11-20T14:00:00Z");

const subject = (
  id: string,
  classScope: string,
  days: number[],
  classIds: string[],
) => ({
  id,
  classScope,
  frequency: "weekly",
  sessionDayOfWeek: days,
  classIds,
});

let storage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  vi.clearAllMocks();
  storage = createFakeStorage();
  vi.stubGlobal("localStorage", storage);
  reads.subjects = [
    subject("maths", "class", [4], ["c1", "c2"]),
    subject("art", "class", [1], ["c3"]),
    subject("assembly", "all", [4], []),
  ];
  reads.studentsFromCopy = false;
  reads.serverAnswers = true;
});

const teacher = (now: Date, role = "regular_teacher") =>
  prefetchRegisters({
    uid: "t1",
    role: role as "regular_teacher",
    institutionId: "inst",
    profile: { assignedClassId: "home" },
    now,
  });

describe("prefetchRegisters", () => {
  it("reads nothing for admins, students or parents", async () => {
    for (const role of ["institution_admin", "student", "parent"]) {
      await teacher(THURSDAY, role);
    }
    expect(fetchInstitutionSubjects).not.toHaveBeenCalled();
    expect(loadClassStudents).not.toHaveBeenCalled();
    expect(storage.getItem(PREFETCH_DONE_KEY)).toBeNull();
  });

  it("reads each class of today's subjects, skipping whole-school subjects and other days", async () => {
    await teacher(THURSDAY);
    expect(
      vi.mocked(fetchEnrolledStudents).mock.calls.map((c) => c.slice(1)),
    ).toEqual([
      ["maths", "c1"],
      ["maths", "c2"],
    ]);
    expect(keepWeek).toHaveBeenCalledTimes(2);
    expect(storage.getItem(PREFETCH_DONE_KEY)).toBe("t1:2026-11-19");
  });

  it("runs once a day on each device, and again the next day", async () => {
    await teacher(THURSDAY);
    await teacher(THURSDAY);
    expect(fetchInstitutionSubjects).toHaveBeenCalledTimes(1);

    reads.subjects = [subject("maths", "class", [5], ["c1"])];
    await teacher(FRIDAY);
    expect(fetchInstitutionSubjects).toHaveBeenCalledTimes(2);
    expect(storage.getItem(PREFETCH_DONE_KEY)).toBe("t1:2026-11-20");
  });

  it("stops at the first offline sign and tries again at the next start", async () => {
    reads.studentsFromCopy = true;
    await teacher(THURSDAY);
    expect(fetchEnrolledStudents).toHaveBeenCalledTimes(1);
    expect(keepWeek).not.toHaveBeenCalled();
    expect(storage.getItem(PREFETCH_DONE_KEY)).toBeNull();

    reads.studentsFromCopy = false;
    reads.serverAnswers = false;
    await teacher(THURSDAY);
    expect(keepWeek).toHaveBeenCalledTimes(1);
    expect(storage.getItem(PREFETCH_DONE_KEY)).toBeNull();
  });

  it("forgets the day at sign-out, with the rest of the offline store", async () => {
    await teacher(THURSDAY);
    expect(storage.getItem(PREFETCH_DONE_KEY)).toBe("t1:2026-11-19");
    purgeOfflineStore();
    expect(storage.getItem(PREFETCH_DONE_KEY)).toBeNull();
  });

  it("reads a senior teacher's homeroom", async () => {
    await teacher(THURSDAY, "senior_teacher");
    expect(loadClassStudents).toHaveBeenCalledWith("inst", "home");
    expect(keepWeek).toHaveBeenCalledWith({ name: "home" });
    expect(fetchInstitutionSubjects).not.toHaveBeenCalled();
    expect(storage.getItem(PREFETCH_DONE_KEY)).toBe("t1:2026-11-19");
  });
});
