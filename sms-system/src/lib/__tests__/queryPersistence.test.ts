import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PERSISTABLE_QUERY_ROOTS,
  QUERY_CACHE_STORAGE_KEY,
  isPersistableQueryKey,
  startQueryPersistence,
  stopQueryPersistence,
} from "../queryPersistence";
import { queryClient } from "../queryClient";
import { createFakeStorage } from "./fakeStorage";

describe("query persistence allow-list", () => {
  it("persists reference data", () => {
    for (const root of [
      "terms",
      "classes",
      "subjects",
      "departments",
      "academicYears",
      "nonSchoolDays",
    ]) {
      expect(isPersistableQueryKey([root, "inst-1"])).toBe(true);
    }
    expect(
      isPersistableQueryKey(["nextClassSlots", "inst-1", "c1", "t1"]),
    ).toBe(true);
  });

  it("never persists queries that hold personal data", () => {
    for (const root of [
      "users",
      "classStudents",
      "linkedChildren",
      "houses",
      "profileActivity",
      "profileAudit",
      "profilePerformed",
      "auditLog",
      // The Schedule page's staff views (hooks/useWeekTimetable.ts): slots carry teacher names.
      "scheduleSlots",
    ]) {
      expect(isPersistableQueryKey([root, "inst-1"])).toBe(false);
    }
  });

  it("is private by default: an unknown or malformed key is not persisted", () => {
    expect(isPersistableQueryKey(["somethingNew", "inst-1"])).toBe(false);
    expect(isPersistableQueryKey([])).toBe(false);
    expect(isPersistableQueryKey([42])).toBe(false);
  });

  it("keeps the allow-list free of the known personal-data roots", () => {
    for (const forbidden of [
      "users",
      "houses",
      "classStudents",
      "linkedChildren",
    ]) {
      expect(PERSISTABLE_QUERY_ROOTS).not.toContain(forbidden);
    }
  });
});

describe("startQueryPersistence", () => {
  let session: ReturnType<typeof createFakeStorage>;

  beforeEach(() => {
    session = createFakeStorage();
    vi.stubGlobal("window", { sessionStorage: session });
    vi.useFakeTimers();
    queryClient.clear();
  });

  afterEach(() => {
    stopQueryPersistence();
    queryClient.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function settle(ms = 1500) {
    await vi.advanceTimersByTimeAsync(ms);
  }

  it("writes allow-listed queries and never a personal-data query", async () => {
    startQueryPersistence("uid-a");
    await settle(0); // restore finishes, then it subscribes
    queryClient.setQueryData(["terms", "inst"], [{ id: "t1", name: "Term 1" }]);
    queryClient.setQueryData(
      ["users", "inst"],
      [{ id: "u1", dateOfBirth: "2010-01-01" }],
    );
    await settle(); // the persister's save is throttled to 1 s

    const raw = session.getItem(QUERY_CACHE_STORAGE_KEY);
    expect(raw).toContain("Term 1");
    expect(raw).not.toContain("dateOfBirth");
    expect(raw).not.toContain('"users"');
  });

  it("restores the cache for the same user after a reload", async () => {
    startQueryPersistence("uid-a");
    await settle(0);
    queryClient.setQueryData(["terms", "inst"], [{ id: "t1" }]);
    await settle();
    stopQueryPersistence();
    queryClient.clear(); // a reload: empty memory, storage kept

    startQueryPersistence("uid-a");
    await settle(0);
    expect(queryClient.getQueryData(["terms", "inst"])).toEqual([{ id: "t1" }]);
  });

  it("discards a cache written for a different user", async () => {
    startQueryPersistence("uid-a");
    await settle(0);
    queryClient.setQueryData(["terms", "inst"], [{ id: "t1" }]);
    await settle();
    stopQueryPersistence();
    queryClient.clear();

    startQueryPersistence("uid-b");
    await settle(0);
    expect(queryClient.getQueryData(["terms", "inst"])).toBeUndefined();
  });

  it("does not subscribe if the session ended while the restore was in flight", async () => {
    startQueryPersistence("uid-a");
    stopQueryPersistence(); // before the restore promise resolves
    await settle(0);
    queryClient.setQueryData(["terms", "inst"], [{ id: "t1" }]);
    await settle();
    expect(session.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
  });
});
