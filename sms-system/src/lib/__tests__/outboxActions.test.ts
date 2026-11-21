import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Settling an outbox clash or discarding a refused save (lib/offline/outboxActions.ts, OFFLINE_ATTENDANCE_SPEC.md
// slice C).

vi.mock("@/lib/offline/outboxSender", () => ({ wakeOutbox: vi.fn() }));

const { importKey, newKeyBytes } = await import("../offline/offlineCrypto");
const offlineStore = await import("../offline/offlineStore");
const outbox = await import("../offline/outboxStore");
const { discardItem, resolveConflict, sendAnyway } =
  await import("../offline/outboxActions");
const { wakeOutbox } = await import("@/lib/offline/outboxSender");

const P = { state: "P" };
const A = { state: "A" };
const L = { state: "L" };

const payload = (command: {
  changes: Record<string, { state: string } | null>;
  base: Record<string, { state: string } | null>;
}) => ({
  kind: "register.general" as const,
  institutionId: "inst",
  docId: "ga_c1_2026-11-20_AM",
  targetKey: "general|inst|c1|2026-11-20|AM",
  fields: { classId: "c1" },
  command,
  markedAt: 1,
  actor: { uid: "t1", name: "Teacher" },
  audit: {
    eventType: "attendance_edit",
    detail: "d",
    targetUid: "c1",
    targetName: "C1",
  },
});

async function conflictItem() {
  const item = await outbox.enqueueSave(
    payload({ changes: { s1: A, s2: L }, base: { s1: P, s2: P } }),
    1,
  );
  const conflict = {
    ...item!,
    state: "conflict" as const,
    attempts: 1,
    payload: {
      ...item!.payload,
      clash: { s1: { mine: A, theirs: L }, s2: { mine: L, theirs: A } },
    },
  };
  await outbox.putItem(conflict);
  return conflict;
}

beforeEach(async () => {
  vi.clearAllMocks();
  outbox.setOutboxBackendForTests(outbox.memoryOutboxBackend());
  offlineStore.setOfflineBackendForTests(offlineStore.memoryOfflineBackend());
  await offlineStore.setOfflineSession("t1", await importKey(newKeyBytes()));
});
afterEach(async () => {
  await offlineStore.setOfflineSession(null, null);
  outbox.setOutboxBackendForTests(null);
  offlineStore.setOfflineBackendForTests(null);
});

describe("resolveConflict", () => {
  it("queues the students kept as mine over what the other device wrote, and drops the rest", async () => {
    const item = await conflictItem();
    await resolveConflict(item, { s1: "mine", s2: "theirs" });
    const items = await outbox.outboxItems();
    expect(items).toHaveLength(1);
    expect(items[0].opId).not.toBe(item.opId);
    expect(items[0].payload.command).toEqual({
      changes: { s1: A },
      base: { s1: L },
    });
    expect(wakeOutbox).toHaveBeenCalled();
  });

  it("removes the item when everything is kept as theirs", async () => {
    const item = await conflictItem();
    await resolveConflict(item, { s1: "theirs", s2: "theirs" });
    expect(await outbox.outboxItems()).toEqual([]);
  });

  it("never folds into an older unsent save of the same register, whose base would clash again", async () => {
    const item = await conflictItem();
    await outbox.enqueueSave(
      payload({ changes: { s3: P }, base: { s3: null } }),
      2,
    );
    await resolveConflict(item, { s1: "mine", s2: "mine" });
    const pending = (await outbox.outboxItems()).filter(
      (i) => i.state === "pending",
    );
    expect(pending).toHaveLength(2);
    expect(pending.map((i) => i.payload.command.base)).toContainEqual({
      s1: L,
      s2: A,
    });
  });
});

describe("discardItem", () => {
  it("drops a refused save", async () => {
    const item = await outbox.enqueueSave(
      payload({ changes: { s1: A }, base: { s1: P } }),
      1,
    );
    await discardItem(item!);
    expect(await outbox.outboxItems()).toEqual([]);
  });
});

describe("sendAnyway", () => {
  it("gives an expired save another 7 days and tries it at once", async () => {
    const item = await outbox.enqueueSave(
      payload({ changes: { s1: A }, base: { s1: P } }),
      1,
    );
    await outbox.putItem({ ...item!, state: "pending", expiresAt: 2 });
    await sendAnyway(item!, 1000);
    const [renewed] = await outbox.outboxItems();
    expect(renewed).toMatchObject({
      opId: item!.opId,
      state: "pending",
      expiresAt: 1000 + outbox.OUTBOX_KEEP_MS,
      nextAttemptAt: 1000,
    });
    expect(wakeOutbox).toHaveBeenCalled();
  });
});
