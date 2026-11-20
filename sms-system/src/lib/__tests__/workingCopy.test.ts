import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import { importKey, newKeyBytes } from "../offline/offlineCrypto";
import {
  memoryOfflineBackend,
  setOfflineBackendForTests,
  setOfflineSession,
} from "../offline/offlineStore";
import {
  olderCopy,
  overlay,
  readThrough,
  storedCopy,
} from "../offline/workingCopy";
import { meetsOn, todaysSubjectClasses } from "../offline/todaysRegisters";
import type { SubjectDocument } from "@/types/institution";

// Working copies of what the registers read (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice B).

const offline = Object.assign(
  new Error("Failed to get document because the client is offline."),
  {
    code: "unavailable",
  },
);

async function signIn() {
  await setOfflineSession("teacher-1", await importKey(newKeyBytes()));
}

beforeEach(() => setOfflineBackendForTests(memoryOfflineBackend()));
afterEach(async () => {
  await setOfflineSession(null, null);
  setOfflineBackendForTests(null);
});

describe("readThrough", () => {
  it("answers from the copy at once when the browser says it's offline, without waiting for the read", async () => {
    await signIn();
    await readThrough("classStudents:i:c", async () => ({
      value: ["Ann"],
      fromCache: false,
    }));
    await vi.waitFor(async () =>
      expect(await storedCopy("classStudents:i:c")).toBeDefined(),
    );
    vi.stubGlobal("navigator", { onLine: false });
    try {
      const slowRead = vi.fn(() => new Promise<never>(() => {}));
      const read = await readThrough("classStudents:i:c", slowRead);
      expect(read).toMatchObject({ value: ["Ann"], fromCopy: true });
      expect(slowRead).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a copy of a server answer, and answers from it when the device is offline", async () => {
    await signIn();
    const online = await readThrough("classStudents:i:c", async () => ({
      value: ["Ann"],
      fromCache: false,
    }));
    expect(online).toEqual({ value: ["Ann"], fromCopy: false, savedAt: null });
    await vi.waitFor(async () =>
      expect(await storedCopy("classStudents:i:c")).toBeDefined(),
    );

    const later = await readThrough("classStudents:i:c", async () => {
      throw offline;
    });
    expect(later.value).toEqual(["Ann"]);
    expect(later.fromCopy).toBe(true);
    expect(typeof later.savedAt).toBe("number");
  });

  it("gives back real Timestamps from a copy, so calendar code can call toMillis() offline", async () => {
    await signIn();
    const createdAt = new Timestamp(1_763_000_000, 5);
    await readThrough("academicYears:i", async () => ({
      value: [{ id: "y1", createdAt, nested: { at: [createdAt] } }],
      fromCache: false,
    }));
    await vi.waitFor(async () =>
      expect(await storedCopy("academicYears:i")).toBeDefined(),
    );
    const read = await readThrough<
      { createdAt: Timestamp; nested: { at: Timestamp[] } }[]
    >("academicYears:i", async () => {
      throw offline;
    });
    expect(read.fromCopy).toBe(true);
    expect(read.value[0].createdAt).toBeInstanceOf(Timestamp);
    expect(read.value[0].createdAt.toMillis()).toBe(createdAt.toMillis());
    expect(read.value[0].nested.at[0].isEqual(createdAt)).toBe(true);
  });

  it("prefers the copy to the SDK's empty cache, and never saves a cached answer", async () => {
    await signIn();
    expect(
      (await readThrough("x", async () => ({ value: [], fromCache: true })))
        .fromCopy,
    ).toBe(false);
    expect(await storedCopy("x")).toBeUndefined();

    await readThrough("x", async () => ({
      value: ["server"],
      fromCache: false,
    }));
    await vi.waitFor(async () => expect(await storedCopy("x")).toBeDefined());
    const cached = await readThrough("x", async () => ({
      value: [],
      fromCache: true,
    }));
    expect(cached).toMatchObject({ value: ["server"], fromCopy: true });
  });

  it("without a copy, behaves as the read did: the same error", async () => {
    await signIn();
    await expect(
      readThrough("missing", async () => {
        throw offline;
      }),
    ).rejects.toBe(offline);
  });

  it("passes a real answer such as permission-denied straight through, even with a copy", async () => {
    await signIn();
    await readThrough("y", async () => ({ value: 1, fromCache: false }));
    await vi.waitFor(async () => expect(await storedCopy("y")).toBeDefined());
    const denied = Object.assign(
      new Error("Missing or insufficient permissions."),
      { code: "permission-denied" },
    );
    await expect(
      readThrough("y", async () => {
        throw denied;
      }),
    ).rejects.toBe(denied);
  });

  it("keeps nothing without a session key (students, parents, spectators)", async () => {
    await readThrough("z", async () => ({ value: 1, fromCache: false }));
    await signIn();
    expect(await storedCopy("z")).toBeUndefined();
  });
});

describe("laying the cache over a copy", () => {
  it("keeps the copy's other students and registers when the cache holds only an offline edit", () => {
    type Reg = { id: string; records: Record<string, string> };
    const copy: Reg[] = [
      { id: "ga_c_2026-11-17_AM", records: { a: "P", b: "P" } },
      { id: "ga_c_2026-11-18_AM", records: { a: "L" } },
    ];
    const cached: Reg[] = [{ id: "ga_c_2026-11-17_AM", records: { b: "A" } }];
    expect(overlay(copy, cached)).toEqual([
      { id: "ga_c_2026-11-17_AM", records: { a: "P", b: "A" } },
      { id: "ga_c_2026-11-18_AM", records: { a: "L" } },
    ]);
  });

  it("the older of two copy times", () => {
    expect(olderCopy(null, null)).toBeNull();
    expect(olderCopy(5, null)).toBe(5);
    expect(olderCopy(null, 3)).toBe(3);
    expect(olderCopy(5, 3)).toBe(3);
  });
});

describe("today's subject registers", () => {
  const subject = (over: Partial<SubjectDocument> & { id: string }) =>
    ({
      classScope: "class",
      classIds: ["c1"],
      frequency: "weekly",
      sessionDayOfWeek: [],
      ...over,
    }) as SubjectDocument & {
      id: string;
    };

  it("meets on its weekly days or its custom dates", () => {
    // 2026-11-19 is a Thursday (4)
    expect(
      meetsOn(subject({ id: "s", sessionDayOfWeek: [4] }), "2026-11-19"),
    ).toBe(true);
    expect(
      meetsOn(subject({ id: "s", sessionDayOfWeek: [1] }), "2026-11-19"),
    ).toBe(false);
    expect(
      meetsOn(
        subject({
          id: "s",
          frequency: "custom",
          customFrequencyDays: ["2026-11-19"],
        }),
        "2026-11-19",
      ),
    ).toBe(true);
  });

  it("reads each class of today's subjects, and skips whole-institution subjects", () => {
    const pairs = todaysSubjectClasses(
      [
        subject({ id: "maths", classIds: ["c1", "c2"], sessionDayOfWeek: [4] }),
        subject({ id: "art", sessionDayOfWeek: [1] }),
        subject({ id: "pe", classScope: "institution", sessionDayOfWeek: [4] }),
      ],
      "2026-11-19",
    );
    expect(pairs).toEqual([
      { subjectId: "maths", classId: "c1" },
      { subjectId: "maths", classId: "c2" },
    ]);
  });
});
