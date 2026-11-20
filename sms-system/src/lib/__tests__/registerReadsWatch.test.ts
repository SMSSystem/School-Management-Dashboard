import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The week listener behind both register pages (lib/offline/registerReads.ts, OFFLINE_ATTENDANCE_SPEC.md slice B):
// it keeps only settled server answers, and a copy still being read never lands on top of a newer answer.

type Snap = {
  docs: { id: string; data: () => Record<string, unknown> }[];
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};

const listener = vi.hoisted(() => ({
  next: null as null | ((snap: unknown) => void),
  error: null as null | ((err: unknown) => void),
}));

vi.mock("firebase/firestore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("firebase/firestore")>()),
  where: vi.fn(() => ({})),
  query: vi.fn((collection: unknown) => collection),
  onSnapshot: vi.fn(
    (
      _ref: unknown,
      _options: unknown,
      next: (snap: unknown) => void,
      error: (err: unknown) => void,
    ) => {
      listener.next = next;
      listener.error = error;
      return () => {};
    },
  ),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/paths", () => ({
  institutionCollection: vi.fn((_institutionId: string, name: string) => ({
    name,
  })),
}));

const { importKey, newKeyBytes } = await import("../offline/offlineCrypto");
const { memoryOfflineBackend, setOfflineBackendForTests, setOfflineSession } =
  await import("../offline/offlineStore");
const { keepCopy, storedCopy } = await import("../offline/workingCopy");
const { generalWeek, watchRegisters } =
  await import("../offline/registerReads");

const week = () => generalWeek("inst", "class-1", "2026-11-16", "2026-11-22");

function snap(
  records: Record<string, string>,
  metadata: Snap["metadata"],
): Snap {
  return {
    docs: [{ id: "reg-1", data: () => ({ date: "2026-11-19", records }) }],
    metadata,
  };
}

beforeEach(async () => {
  setOfflineBackendForTests(memoryOfflineBackend());
  await setOfflineSession("teacher-1", await importKey(newKeyBytes()));
});
afterEach(async () => {
  await setOfflineSession(null, null);
  setOfflineBackendForTests(null);
});

describe("watchRegisters", () => {
  it("keeps a server answer only once it has no pending writes", async () => {
    const onRead = vi.fn();
    watchRegisters(week(), onRead, vi.fn());

    listener.next!(
      snap({ s1: "present" }, { fromCache: false, hasPendingWrites: true }),
    );
    expect(onRead).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromCopy: false, savedAt: null }),
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await storedCopy(week().name)).toBeUndefined();

    listener.next!(
      snap({ s1: "present" }, { fromCache: false, hasPendingWrites: false }),
    );
    await vi.waitFor(async () =>
      expect(await storedCopy(week().name)).toBeDefined(),
    );
  });

  it("shows the copy for an answer from the cache, with the cached marks over it", async () => {
    keepCopy(week().name, [
      {
        id: "reg-1",
        date: "2026-11-19",
        records: { s1: "present", s2: "late" },
      },
    ]);
    await vi.waitFor(async () =>
      expect(await storedCopy(week().name)).toBeDefined(),
    );
    const onRead = vi.fn();
    watchRegisters(week(), onRead, vi.fn());

    listener.next!(
      snap({ s2: "absent" }, { fromCache: true, hasPendingWrites: true }),
    );
    await vi.waitFor(() => expect(onRead).toHaveBeenCalled());
    const read = onRead.mock.calls[0][0];
    expect(read.fromCopy).toBe(true);
    expect(onRead.mock.calls[0][1]).toBe(false);
    expect(read.value[0].records).toEqual({ s1: "present", s2: "absent" });
  });

  it("shows the copy before any answer when the browser says it's offline, and lets a later answer replace it", async () => {
    keepCopy(week().name, [
      { id: "reg-1", date: "2026-11-19", records: { s1: "late" } },
    ]);
    await vi.waitFor(async () =>
      expect(await storedCopy(week().name)).toBeDefined(),
    );
    vi.stubGlobal("navigator", { onLine: false });
    try {
      const onRead = vi.fn();
      watchRegisters(week(), onRead, vi.fn());
      await vi.waitFor(() => expect(onRead).toHaveBeenCalledTimes(1));
      expect(onRead.mock.calls[0][0]).toMatchObject({ fromCopy: true });
      expect(onRead.mock.calls[0][1]).toBe(false);

      listener.next!(
        snap({ s1: "present" }, { fromCache: false, hasPendingWrites: false }),
      );
      expect(onRead).toHaveBeenLastCalledWith(
        expect.objectContaining({ fromCopy: false }),
        true,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("drops a copy that finishes reading after a newer server answer", async () => {
    keepCopy(week().name, [
      { id: "reg-1", date: "2026-11-19", records: { s1: "late" } },
    ]);
    await vi.waitFor(async () =>
      expect(await storedCopy(week().name)).toBeDefined(),
    );
    const onRead = vi.fn();
    watchRegisters(week(), onRead, vi.fn());

    listener.next!(snap({}, { fromCache: true, hasPendingWrites: false }));
    listener.next!(
      snap({ s1: "present" }, { fromCache: false, hasPendingWrites: false }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onRead).toHaveBeenCalledTimes(1);
    expect(onRead.mock.calls[0][0]).toMatchObject({
      fromCopy: false,
      savedAt: null,
    });
  });
});
