import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStorage } from "./fakeStorage";
import {
  IDLE_LOCK_STORAGE,
  MAX_UNLOCK_FAILURES,
  afterPasswordCheck,
  idleAction,
  idleLockState,
  lockTab,
  recordFailure,
  resetIdleLockCacheForTests,
  subscribeIdleLock,
  unlockTab,
} from "../offline/idleLock";
import {
  UNLOCK_VERIFIER_STORAGE,
  checkPassword,
  createVerifier,
  forgetVerifier,
  hasVerifier,
  setVerifierIterationsForTests,
} from "../offline/unlockVerifier";

// The offline idle lock (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice D): the tab's state, the password
// verifier it unlocks with, and when an idle timeout locks instead of signing out.

let storage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  storage = createFakeStorage();
  vi.stubGlobal("sessionStorage", storage);
  resetIdleLockCacheForTests();
  setVerifierIterationsForTests(1000);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setVerifierIterationsForTests(null);
});

describe("idleAction", () => {
  it("locks staff who work offline while the device is offline", () => {
    for (const role of [
      "regular_teacher",
      "senior_teacher",
      "institution_admin",
    ] as const)
      expect(idleAction({ role, offline: true })).toBe("lock");
  });

  it("signs everyone else out, and everyone while online, as before", () => {
    for (const role of [
      "student",
      "parent",
      "spectator",
      "super_admin",
    ] as const)
      expect(idleAction({ role, offline: true })).toBe("sign-out");
    expect(idleAction({ role: "regular_teacher", offline: false })).toBe(
      "sign-out",
    );
    expect(idleAction({ role: null, offline: true })).toBe("sign-out");
  });
});

describe("afterPasswordCheck", () => {
  it("unlocks on the right password, lets the person retry, and signs out at the limit or with nothing to check", () => {
    expect(afterPasswordCheck("ok", 0)).toBe("unlock");
    expect(afterPasswordCheck("wrong", 1)).toBe("retry");
    expect(afterPasswordCheck("wrong", MAX_UNLOCK_FAILURES - 1)).toBe("retry");
    expect(afterPasswordCheck("wrong", MAX_UNLOCK_FAILURES)).toBe("sign-out");
    expect(afterPasswordCheck("none", 1)).toBe("sign-out");
  });
});

describe("the lock state", () => {
  it("locks, counts wrong passwords, and unlocks", () => {
    expect(idleLockState()).toBeNull();
    lockTab("t1");
    expect(idleLockState()).toEqual({ uid: "t1", failures: 0 });
    expect(recordFailure()).toBe(1);
    expect(recordFailure()).toBe(2);
    unlockTab();
    expect(idleLockState()).toBeNull();
    expect(storage.getItem(IDLE_LOCK_STORAGE)).toBeNull();
  });

  it("survives a reload: the state is read back from the tab's storage", () => {
    lockTab("t1");
    recordFailure();
    resetIdleLockCacheForTests();
    expect(idleLockState()).toEqual({ uid: "t1", failures: 1 });
  });

  it("tells listeners about every change, and allows five tries", () => {
    const seen: (string | null)[] = [];
    const stop = subscribeIdleLock(() =>
      seen.push(idleLockState()?.uid ?? null),
    );
    lockTab("t1");
    unlockTab();
    stop();
    lockTab("t2");
    expect(seen).toEqual(["t1", null]);
    expect(MAX_UNLOCK_FAILURES).toBe(5);
  });

  it("counts nothing when the tab isn't locked", () => {
    expect(recordFailure()).toBe(0);
  });
});

describe("the password verifier", () => {
  it("tells the right password from a wrong one, and knows when it has nothing to check against", async () => {
    expect(await checkPassword("t1", "secret")).toBe("none");
    expect(await createVerifier("t1", "correct horse")).toBe(true);
    expect(hasVerifier("t1")).toBe(true);
    expect(await checkPassword("t1", "correct horse")).toBe("ok");
    expect(await checkPassword("t1", "correct hors")).toBe("wrong");
    expect(await checkPassword("t2", "correct horse")).toBe("none");
    expect(hasVerifier("t2")).toBe(false);
  });

  it("keeps a salted one-way hash, never the password", async () => {
    await createVerifier("t1", "correct horse");
    const raw = storage.getItem(UNLOCK_VERIFIER_STORAGE) ?? "";
    expect(raw).not.toContain("correct horse");
    const record = JSON.parse(raw);
    expect(Object.keys(record).sort()).toEqual([
      "hash",
      "iterations",
      "salt",
      "uid",
      "v",
    ]);
    const first = record.hash;
    await createVerifier("t1", "correct horse");
    expect(
      JSON.parse(storage.getItem(UNLOCK_VERIFIER_STORAGE) ?? "").hash,
    ).not.toBe(first);
  });

  it("uses 600,000 PBKDF2 iterations outside the tests", async () => {
    setVerifierIterationsForTests(null);
    const source = (await import("../offline/unlockVerifier.ts?raw")).default;
    expect(source).toContain("const ITERATIONS = 600_000;");
    expect(source).toContain('hash: "SHA-256"');
  });

  it("is deleted by forgetVerifier", async () => {
    await createVerifier("t1", "pw");
    forgetVerifier();
    expect(await checkPassword("t1", "pw")).toBe("none");
  });

  it("treats a damaged record as no verifier", async () => {
    storage.setItem(UNLOCK_VERIFIER_STORAGE, "{not json");
    expect(await checkPassword("t1", "pw")).toBe("none");
    storage.setItem(
      UNLOCK_VERIFIER_STORAGE,
      JSON.stringify({ v: 1, uid: "t1", salt: "x", hash: "y", iterations: 0 }),
    );
    expect(await checkPassword("t1", "pw")).toBe("none");
  });
});
