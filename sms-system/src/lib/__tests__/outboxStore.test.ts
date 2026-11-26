import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importKey, newKeyBytes } from "../offline/offlineCrypto";
import {
  memoryOfflineBackend,
  purgeOfflineStore,
  setOfflineBackendForTests,
  setOfflineSession,
} from "../offline/offlineStore";
import {
  OUTBOX_KEEP_MS,
  dropAbandoned,
  enqueueSave,
  hasOutboxItems,
  memoryOutboxBackend,
  outboxItems,
  putItem,
  removeItem,
  setOutboxBackendForTests,
  type OutboxBackend,
  type OutboxPayload,
} from "../offline/outboxStore";

// The encrypted outbox (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C).

const P = { state: "present" };
const A = { state: "absent" };

let backend: OutboxBackend;
let teacherKey: CryptoKey;

function save(
  targetKey: string,
  changes: Record<string, { state: string } | null>,
  base: Record<string, { state: string } | null>,
): Omit<OutboxPayload, "schema"> {
  return {
    kind: "register.general",
    institutionId: "inst",
    docId: `ga_${targetKey}`,
    targetKey,
    fields: { classId: "c1" },
    command: { changes, base },
    markedAt: 1,
    actor: { uid: "teacher-1", name: "Teacher" },
    audit: {
      eventType: "attendance_edit",
      detail: "d",
      targetUid: "c1",
      targetName: "C1",
    },
  };
}

beforeEach(async () => {
  backend = memoryOutboxBackend();
  setOutboxBackendForTests(backend);
  setOfflineBackendForTests(memoryOfflineBackend());
  teacherKey = await importKey(newKeyBytes());
  await setOfflineSession("teacher-1", teacherKey);
});
afterEach(async () => {
  await setOfflineSession(null, null);
  setOutboxBackendForTests(null);
  setOfflineBackendForTests(null);
});

describe("the outbox", () => {
  it("keeps a save sealed, with the register and person as tags only", async () => {
    const item = await enqueueSave(
      save("c1_2026-11-20_AM", { s1: A }, { s1: P }),
      1000,
    );
    expect(item).toMatchObject({
      state: "pending",
      attempts: 0,
      expiresAt: 1000 + OUTBOX_KEEP_MS,
    });
    const [row] = await backend.all();
    const onDisk = JSON.stringify(row);
    expect(onDisk).not.toContain("c1_2026-11-20_AM");
    expect(onDisk).not.toContain("teacher-1");
    expect(onDisk).not.toContain("absent");
    expect((await outboxItems())[0].payload.command.changes).toEqual({ s1: A });
  });

  it("folds a second save of the same register into an item not yet tried", async () => {
    await enqueueSave(save("r1", { s1: A }, { s1: P }));
    await enqueueSave(save("r1", { s2: P }, { s2: null }));
    await enqueueSave(save("r2", { s1: P }, { s1: null }));
    const items = await outboxItems();
    expect(items).toHaveLength(2);
    expect(items[0].payload.command).toEqual({
      changes: { s1: A, s2: P },
      base: { s1: P, s2: null },
    });
  });

  it("never changes an item that was already tried, since it may have landed", async () => {
    const first = await enqueueSave(save("r1", { s1: A }, { s1: P }));
    await putItem({ ...first!, attempts: 1 });
    await enqueueSave(save("r1", { s1: P }, { s1: A }));
    const items = await outboxItems();
    expect(items).toHaveLength(2);
    expect(items[0].opId).toBe(first!.opId);
  });

  it("never folds a new save into an expired item, which would take it into the expiry dialog", async () => {
    const old = await enqueueSave(save("r1", { s1: A }, { s1: P }), 0);
    const later = OUTBOX_KEEP_MS + 5;
    const fresh = await enqueueSave(save("r1", { s2: P }, { s2: null }), later);
    expect(fresh!.opId).not.toBe(old!.opId);
    expect(fresh!.expiresAt).toBe(later + OUTBOX_KEEP_MS);
    expect(await outboxItems()).toHaveLength(2);
  });

  it("queues nothing without a session key", async () => {
    await setOfflineSession(null, null);
    expect(await enqueueSave(save("r1", { s1: A }, { s1: P }))).toBeNull();
    expect(await backend.all()).toEqual([]);
  });

  it("shows each person only their own items, and keeps everyone's", async () => {
    await enqueueSave(save("r1", { s1: A }, { s1: P }));
    await setOfflineSession("teacher-2", await importKey(newKeyBytes()));
    expect(await outboxItems()).toEqual([]);
    await enqueueSave(save("r9", { s1: P }, { s1: null }));
    expect(await backend.all()).toHaveLength(2);

    await setOfflineSession("teacher-1", teacherKey);
    expect((await outboxItems()).map((i) => i.payload.targetKey)).toEqual([
      "r1",
    ]);
  });

  it("survives sign-out, and is there again when the same person signs back in", async () => {
    await enqueueSave(save("r1", { s1: A }, { s1: P }));
    purgeOfflineStore();
    expect(await backend.all()).toHaveLength(1);
    await setOfflineSession("teacher-1", teacherKey);
    expect(await outboxItems()).toHaveLength(1);
  });

  it("removes an item once it is sent", async () => {
    const item = await enqueueSave(save("r1", { s1: A }, { s1: P }));
    await removeItem(item!.opId);
    expect(await outboxItems()).toEqual([]);
  });
});

describe("dropAbandoned", () => {
  it("removes anyone's row a week after it expired, without opening it, and keeps the rest", async () => {
    await enqueueSave(save("r1", { s1: A }, { s1: P }), 0);
    await setOfflineSession("teacher-2", await importKey(newKeyBytes()));
    await enqueueSave(save("r2", { s1: A }, { s1: P }), 0);
    await enqueueSave(save("r3", { s1: A }, { s1: P }), OUTBOX_KEEP_MS);
    await setOfflineSession(null, null);

    expect(await dropAbandoned(2 * OUTBOX_KEEP_MS - 1)).toBe(0);
    expect(await dropAbandoned(2 * OUTBOX_KEEP_MS)).toBe(2);
    expect(await backend.all()).toHaveLength(1);
  });
});

describe("onOfflineSession", () => {
  it("tells the outbox sender when a person's key becomes available, so a fresh sign-in sends unsent work", async () => {
    const { onOfflineSession } = await import("../offline/offlineStore");
    let calls = 0;
    const stop = onOfflineSession(() => calls++);
    await setOfflineSession(null, null);
    expect(calls).toBe(0);
    await setOfflineSession("teacher-1", teacherKey);
    expect(calls).toBe(1);
    stop();
    await setOfflineSession("teacher-1", teacherKey);
    expect(calls).toBe(1);
  });
});

describe("hasOutboxItems", () => {
  it("says whether this person has anything queued, without counting anyone else's", async () => {
    expect(await hasOutboxItems()).toBe(false);
    await enqueueSave(save("r1", { s1: A }, { s1: P }));
    expect(await hasOutboxItems()).toBe(true);
    await setOfflineSession("teacher-2", await importKey(newKeyBytes()));
    expect(await hasOutboxItems()).toBe(false);
    await setOfflineSession(null, null);
    expect(await hasOutboxItems()).toBe(false);
  });
});
