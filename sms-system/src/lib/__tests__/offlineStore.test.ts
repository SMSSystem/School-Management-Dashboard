import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importKey, newKeyBytes, seal, unseal } from "../offline/offlineCrypto";
import {
  memoryOfflineBackend,
  offlineStoreReady,
  purgeOfflineStore,
  readCopies,
  readCopy,
  removeCopy,
  saveCopy,
  setOfflineBackendForTests,
  setOfflineSession,
  type OfflineBackend,
} from "../offline/offlineStore";
import {
  isOfflineError,
  offlineStartFrom,
  pickProfile,
  worksOffline,
} from "../offline/offlineStart";

const newKey = () => importKey(newKeyBytes());

describe("encryption", () => {
  it("round-trips a value under its id", async () => {
    const key = await newKey();
    const sealed = await seal(key, "id1", { reason: "Doctor" });
    expect(await unseal(key, "id1", sealed)).toEqual({ reason: "Doctor" });
  });

  it("can't be read with another key, or moved to another id", async () => {
    const key = await newKey();
    const sealed = await seal(key, "id1", { reason: "Doctor" });
    expect(await unseal(await newKey(), "id1", sealed)).toBeUndefined();
    expect(await unseal(key, "id2", sealed)).toBeUndefined();
  });

  it("uses a fresh IV every time, so the same value never looks the same", async () => {
    const key = await newKey();
    const a = await seal(key, "id1", "same");
    const b = await seal(key, "id1", "same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });
});

describe("the offline store", () => {
  let backend: OfflineBackend;

  beforeEach(() => {
    backend = memoryOfflineBackend();
    setOfflineBackendForTests(backend);
  });

  afterEach(async () => {
    await setOfflineSession(null, null);
    setOfflineBackendForTests(null);
  });

  it("keeps nothing without a key", async () => {
    expect(offlineStoreReady()).toBe(false);
    expect(await saveCopy("profile", { role: "regular_teacher" })).toBe(false);
    expect(await readCopy("profile")).toBeUndefined();
  });

  it("keeps a working copy for its owner, encrypted, under an id that doesn't show its name", async () => {
    await setOfflineSession("uid-a", await newKey());
    expect(await saveCopy("profile", { name: "Ms A", reason: "Doctor" })).toBe(
      true,
    );
    expect(await readCopy("profile")).toEqual({
      name: "Ms A",
      reason: "Doctor",
    });
    const [record] = await backend.all();
    const onDisk = JSON.stringify(record);
    expect(onDisk).not.toContain("profile");
    expect(onDisk).not.toContain("Doctor");
    expect(onDisk).not.toContain("uid-a");
  });

  it("lists copies by name prefix, and removes one", async () => {
    await setOfflineSession("uid-a", await newKey());
    await saveCopy("draft:a", 1);
    await saveCopy("draft:b", 2);
    await saveCopy("profile", 3);
    expect(
      (await readCopies<number>("draft:")).map((c) => c.value).sort(),
    ).toEqual([1, 2]);
    await removeCopy("draft:a");
    expect((await readCopies<number>("draft:")).map((c) => c.value)).toEqual([
      2,
    ]);
  });

  it("removes another person's records when a new person's session starts", async () => {
    await setOfflineSession("uid-a", await newKey());
    await saveCopy("profile", "a");
    await setOfflineSession("uid-b", await newKey());
    expect(await backend.all()).toEqual([]);
    expect(await readCopy("profile")).toBeUndefined();
  });

  it("can't be read without this tab's key, even by the same person", async () => {
    await setOfflineSession("uid-a", await newKey());
    await saveCopy("profile", "a");
    await setOfflineSession("uid-a", await newKey());
    expect(await readCopy("profile")).toBeUndefined();
  });

  it("stops keeping anything once purged", async () => {
    await setOfflineSession("uid-a", await newKey());
    purgeOfflineStore();
    setOfflineBackendForTests(backend);
    expect(offlineStoreReady()).toBe(false);
    expect(await saveCopy("profile", "a")).toBe(false);
  });
});

describe("starting offline", () => {
  it("treats only an unreachable server as offline, never a refusal", () => {
    expect(isOfflineError({ code: "unavailable" }, true)).toBe(true);
    expect(isOfflineError({ code: "deadline-exceeded" }, true)).toBe(true);
    expect(
      isOfflineError(
        { message: "Failed to get document because the client is offline." },
        true,
      ),
    ).toBe(true);
    expect(isOfflineError({ code: "permission-denied" }, true)).toBe(false);
    expect(isOfflineError({ code: "not-found" }, true)).toBe(false);
  });

  it("treats any failure as offline when the browser says it is offline", () => {
    expect(isOfflineError({ code: "permission-denied" }, false)).toBe(true);
  });

  it("starts from the copy only when it is this person's and has a role", () => {
    const copy = {
      uid: "uid-a",
      profile: { role: "regular_teacher" },
      institution: null,
      institutionExists: null,
      savedAt: 1,
    };
    expect(offlineStartFrom(copy, "uid-a")).toBe("copy");
    expect(offlineStartFrom(copy, "uid-b")).toBe("blocked");
    expect(offlineStartFrom({ ...copy, profile: {} }, "uid-a")).toBe("blocked");
    expect(offlineStartFrom(undefined, "uid-a")).toBe("blocked");
  });

  it("keeps only the profile fields the app uses", () => {
    const picked = pickProfile({
      role: "regular_teacher",
      name: "Ms A",
      dateOfBirth: "2000-01-01",
      idNumber: "X1",
    });
    expect(picked).toEqual({ role: "regular_teacher", name: "Ms A" });
  });

  it("is for staff who mark registers", () => {
    for (const role of [
      "regular_teacher",
      "senior_teacher",
      "institution_admin",
    ] as const) {
      expect(worksOffline(role)).toBe(true);
    }
    for (const role of [
      "student",
      "parent",
      "spectator",
      "super_admin",
    ] as const) {
      expect(worksOffline(role)).toBe(false);
    }
  });
});
