import { beforeEach, describe, expect, it, vi } from "vitest";

// Queuing register saves (lib/offline/registerQueue.ts, OFFLINE_ATTENDANCE_SPEC.md slice C): only what changed from
// what this person expects the server to hold is queued, at the register's fixed id.

const queued = vi.hoisted(() => ({
  result: {} as unknown,
  calls: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/offline/outboxStore", () => ({
  enqueueSave: vi.fn(async (payload: Record<string, unknown>) => {
    queued.calls.push(payload);
    return queued.result;
  }),
}));
vi.mock("@/lib/offline/outboxSender", () => ({ wakeOutbox: vi.fn() }));

const {
  queueGeneralSave,
  queueSubjectSave,
  generalTargetKey,
  subjectTargetKey,
} = await import("../offline/registerQueue");
const { wakeOutbox } = await import("@/lib/offline/outboxSender");

const P = { state: "P", studentName: "Ann" };
const A = { state: "A", studentName: "Ann" };
const common = {
  institutionId: "inst",
  classId: "c1",
  className: "C1",
  termId: "t",
  academicYearId: "y",
  dateISO: "2026-11-20",
  actor: { uid: "t1", name: "Teacher" },
};
const summary = {
  classId: "c1",
  termId: "t",
  academicYearId: "y",
  termStartDate: "2026-09-01",
  termEndDate: "2026-12-15",
  schoolWeekDays: [1, 2, 3, 4, 5],
  nonSchoolDays: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  queued.calls = [];
  queued.result = { opId: "op" };
});

describe("queueGeneralSave", () => {
  it("queues only what changed, at the register's fixed id, and wakes the sender", async () => {
    const result = await queueGeneralSave({
      ...common,
      session: "AM",
      saved: undefined,
      pending: [],
      records: { s1: P },
      summary,
    });
    expect(result).toBe("queued");
    expect(queued.calls[0]).toMatchObject({
      kind: "register.general",
      docId: "ga_c1_2026-11-20_AM",
      targetKey: generalTargetKey("inst", "c1", "2026-11-20", "AM"),
      fields: { classId: "c1", date: "2026-11-20", session: "AM" },
      command: { changes: { s1: P }, base: { s1: null } },
      summary,
    });
    expect(wakeOutbox).toHaveBeenCalled();
  });

  it("keeps a register saved before fixed ids at its own id", async () => {
    await queueGeneralSave({
      ...common,
      session: "AM",
      saved: { id: "legacy-id", records: { s1: P } },
      pending: [],
      records: { s1: A },
      summary,
    });
    expect(queued.calls[0]).toMatchObject({
      docId: "legacy-id",
      command: { changes: { s1: A }, base: { s1: P } },
    });
  });

  it("queues nothing when the register already matches, including this person's unsent changes", async () => {
    const result = await queueGeneralSave({
      ...common,
      session: "AM",
      saved: { id: "ga_c1_2026-11-20_AM", records: { s1: P } },
      pending: [{ changes: { s1: A }, base: { s1: P } }],
      records: { s1: A },
      summary,
    });
    expect(result).toBe("unchanged");
    expect(queued.calls).toEqual([]);
  });

  it("says when the save couldn't be kept on the device", async () => {
    queued.result = null;
    expect(
      await queueGeneralSave({
        ...common,
        session: "PM",
        saved: undefined,
        pending: [],
        records: { s1: P },
        summary,
      }),
    ).toBe("not-kept");
  });
});

describe("queueSubjectSave", () => {
  it("queues at the subject register's fixed id", async () => {
    await queueSubjectSave({
      ...common,
      subjectId: "sub1",
      subjectName: "Maths",
      saved: undefined,
      pending: [],
      records: { s1: P },
    });
    expect(queued.calls[0]).toMatchObject({
      kind: "register.subject",
      docId: "sa_sub1_c1_2026-11-20",
      targetKey: subjectTargetKey("inst", "sub1", "c1", "2026-11-20"),
      fields: { subjectId: "sub1", sessionDate: "2026-11-20" },
    });
  });
});
