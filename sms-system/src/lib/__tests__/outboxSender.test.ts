import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The outbox sender's transaction (lib/offline/outboxSender.ts, OFFLINE_ATTENDANCE_SPEC.md slice C): a repeat is
// recognised, students someone else changed are set aside, and the register, lastOpByUser and audit entry go together.

const fs = vi.hoisted(() => ({
  server: undefined as Record<string, unknown> | undefined,
  writes: [] as { ref: { path: string }; data: Record<string, unknown> }[],
}));

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  doc: vi.fn((collection: { path: string }) => ({
    path: `${collection.path}/auto`,
  })),
  deleteField: vi.fn(() => "DELETE"),
  serverTimestamp: vi.fn(() => "NOW"),
  runTransaction: vi.fn(async (_db: unknown, body: (tx: unknown) => unknown) =>
    body({
      get: async () => ({
        exists: () => fs.server !== undefined,
        data: () => fs.server,
      }),
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        fs.writes.push({ ref, data }),
    }),
  ),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/paths", () => ({
  institutionDoc: vi.fn((i: string, c: string, id: string) => ({
    path: `institutions/${i}/${c}/${id}`,
  })),
  institutionCollection: vi.fn((i: string, c: string) => ({
    path: `institutions/${i}/${c}`,
  })),
}));
vi.mock("@/lib/attendanceSummaryUtils", () => ({
  rebuildSummariesForClass: vi.fn(),
}));

const { sendItem, wakeOutbox } = await import("../offline/outboxSender");
const { importKey, newKeyBytes } = await import("../offline/offlineCrypto");
const offlineStore = await import("../offline/offlineStore");
const outbox = await import("../offline/outboxStore");
const { rebuildSummariesForClass } =
  await import("@/lib/attendanceSummaryUtils");
const { runTransaction } = await import("firebase/firestore");
import type { OutboxItem } from "../offline/outboxStore";

const P = { state: "present" };
const A = { state: "absent" };
const L = { state: "late" };

function item(
  kind: OutboxItem["payload"]["kind"] = "register.general",
): OutboxItem {
  return {
    opId: "op-1",
    state: "sending",
    attempts: 1,
    createdAt: 1,
    expiresAt: 2,
    nextAttemptAt: 0,
    payload: {
      schema: 1,
      kind,
      institutionId: "inst",
      docId: "ga_c1_2026-11-20_AM",
      targetKey: "c1|2026-11-20|AM",
      fields: { classId: "c1", date: "2026-11-20", session: "AM" },
      command: {
        changes: { s1: A, s2: L, s3: null },
        base: { s1: P, s2: P, s3: P },
      },
      markedAt: 123,
      actor: { uid: "t1", name: "Teacher One" },
      audit: {
        eventType: "attendance_edit",
        detail: "d",
        targetUid: "c1",
        targetName: "C1",
      },
    },
  };
}

beforeEach(() => {
  fs.server = undefined;
  fs.writes = [];
});
afterEach(() => vi.clearAllMocks());

describe("sendItem", () => {
  it("writes nothing when the register already carries this item's id: an earlier try landed", async () => {
    fs.server = { records: { s1: A }, lastOpByUser: { t1: "op-1" } };
    expect(await sendItem(item())).toEqual({ wrote: false, clash: {} });
    expect(fs.writes).toEqual([]);
  });

  it("applies the students still as they were, sets aside one someone else changed, and records the operation", async () => {
    fs.server = {
      records: { s1: P, s2: A, s3: P },
      lastOpByUser: { other: "x" },
    };
    const outcome = await sendItem(item());
    expect(outcome).toEqual({
      wrote: true,
      clash: { s2: { mine: L, theirs: A } },
    });
    const [register, audit] = fs.writes;
    expect(register.ref.path).toBe(
      "institutions/inst/generalAttendance/ga_c1_2026-11-20_AM",
    );
    expect(register.data).toMatchObject({
      classId: "c1",
      institutionId: "inst",
      records: { s1: A, s3: "DELETE" },
      submittedBy: "t1",
      markedAt: 123,
      lastOpByUser: { t1: "op-1" },
    });
    expect(register.data).not.toHaveProperty("createdAt");
    expect(audit.ref.path).toBe("institutions/inst/audit_log/auto");
    expect(audit.data).toMatchObject({
      performedBy: "t1",
      performedByName: "Teacher One",
      recordedAt: "NOW",
    });
  });

  it("creates a register that doesn't exist yet, and writes the subject teacher as the sender", async () => {
    const subject = item("register.subject");
    subject.payload.command = { changes: { s1: P }, base: { s1: null } };
    expect(await sendItem(subject)).toEqual({ wrote: true, clash: {} });
    expect(fs.writes[0].ref.path).toContain("/subjectAttendance/");
    expect(fs.writes[0].data).toMatchObject({
      teacherId: "t1",
      createdAt: "NOW",
      records: { s1: P },
    });
  });

  it("writes nothing, not even an audit entry, when every student clashes", async () => {
    fs.server = { records: { s1: L, s2: A, s3: A } };
    const outcome = await sendItem(item());
    expect(outcome.wrote).toBe(false);
    expect(Object.keys(outcome.clash)).toEqual(["s1", "s2", "s3"]);
    expect(fs.writes).toEqual([]);
  });
});

describe("a sending round", () => {
  const summary = {
    classId: "c1",
    termId: "t",
    academicYearId: "y",
    termStartDate: "2026-09-01",
    termEndDate: "2026-12-15",
    schoolWeekDays: [1, 2, 3, 4, 5],
    nonSchoolDays: [],
  };

  async function queue(
    targetKey: string,
    extra: Partial<OutboxItem["payload"]> = {},
  ) {
    const payload: Omit<OutboxItem["payload"], "schema"> = {
      ...item().payload,
    };
    return outbox.enqueueSave({ ...payload, targetKey, summary, ...extra });
  }

  beforeEach(async () => {
    outbox.setOutboxBackendForTests(outbox.memoryOutboxBackend());
    offlineStore.setOfflineBackendForTests(offlineStore.memoryOfflineBackend());
    await offlineStore.setOfflineSession("t1", await importKey(newKeyBytes()));
  });
  afterEach(async () => {
    await offlineStore.setOfflineSession(null, null);
    outbox.setOutboxBackendForTests(null);
    offlineStore.setOfflineBackendForTests(null);
  });

  it("sends due items, removes them, and rebuilds each class's summary once", async () => {
    fs.server = { records: { s1: P, s2: P, s3: P } };
    await queue("c1|AM");
    await queue("c1|PM");
    await wakeOutbox();
    expect(await outbox.outboxItems()).toEqual([]);
    expect(vi.mocked(rebuildSummariesForClass)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rebuildSummariesForClass).mock.calls[0][0]).toMatchObject({
      classId: "c1",
      institutionId: "inst",
    });
  });

  it("keeps only the clashing students, waiting for a choice", async () => {
    fs.server = { records: { s1: P, s2: A, s3: P } };
    await queue("c1|AM");
    await wakeOutbox();
    const [left] = await outbox.outboxItems();
    expect(left.state).toBe("conflict");
    expect(left.payload.clash).toEqual({ s2: { mine: L, theirs: A } });
    expect(left.payload.command.changes).toEqual({ s2: L });
  });

  it("retries a refusal later, and refuses it for good after three tries", async () => {
    vi.mocked(runTransaction).mockRejectedValue(
      Object.assign(new Error("no"), { code: "permission-denied" }),
    );
    const queued = await queue("c1|AM");
    await wakeOutbox();
    let [left] = await outbox.outboxItems();
    expect(left).toMatchObject({ state: "pending", attempts: 1 });
    expect(left.nextAttemptAt).toBeGreaterThan(Date.now());

    await outbox.putItem({ ...left, attempts: 2, nextAttemptAt: 0 });
    await wakeOutbox();
    [left] = await outbox.outboxItems();
    expect(left.opId).toBe(queued!.opId);
    expect(left.state).toBe("refused");
    expect(left.payload.refusedReason).toMatch(/refused/);
  });

  it("never sends another person's items", async () => {
    await queue("c1|AM", { actor: { uid: "someone-else", name: "X" } });
    await wakeOutbox();
    expect(vi.mocked(runTransaction)).not.toHaveBeenCalled();
  });
});
