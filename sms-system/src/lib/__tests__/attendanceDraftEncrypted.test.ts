import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adoptEncryptedDrafts,
  clearAllDrafts,
  clearDraft,
  getDraft,
  setDraftCell,
  setDraftOwner,
} from "../attendanceDraft";
import { importKey, newKeyBytes } from "../offline/offlineCrypto";
import {
  memoryOfflineBackend,
  readCopies,
  setOfflineBackendForTests,
  setOfflineSession,
  type OfflineBackend,
} from "../offline/offlineStore";
import { createFakeStorage } from "./fakeStorage";

const E = { state: "E", reason: "Dentist" } as const;
let storage: ReturnType<typeof createFakeStorage>;
let backend: OfflineBackend;

const storedDrafts = async (count: number) =>
  vi.waitFor(async () =>
    expect(await readCopies("draft:")).toHaveLength(count),
  );

beforeEach(() => {
  storage = createFakeStorage();
  vi.stubGlobal("localStorage", storage);
  backend = memoryOfflineBackend();
  setOfflineBackendForTests(backend);
  setDraftOwner("uid-a");
});

afterEach(async () => {
  setDraftOwner(null);
  await setOfflineSession(null, null);
  setOfflineBackendForTests(null);
  vi.unstubAllGlobals();
});

describe("attendance drafts with the offline key", () => {
  it("stay in localStorage until the tab has its key", async () => {
    await adoptEncryptedDrafts();
    setDraftCell("inst", "c1", "2026-10-05", "AM", "s1", E);
    expect(storage.length).toBe(1);
  });

  it("move from localStorage into the encrypted store, leaving no plaintext reason behind", async () => {
    setDraftCell("inst", "c1", "2026-10-05", "AM", "s1", E);
    await setOfflineSession("uid-a", await importKey(newKeyBytes()));
    await adoptEncryptedDrafts();
    expect(getDraft("inst", "c1", "2026-10-05", "AM")).toEqual({ s1: E });
    expect(storage.length).toBe(0);
    expect(JSON.stringify(await backend.all())).not.toContain("Dentist");
  });

  it("are written to the store, not localStorage, once adopted", async () => {
    await setOfflineSession("uid-a", await importKey(newKeyBytes()));
    await adoptEncryptedDrafts();
    setDraftCell("inst", "c1", "2026-10-05", "AM", "s1", E);
    await storedDrafts(1);
    expect(storage.length).toBe(0);
  });

  it("survive a reload: a new page with the same key reads them back", async () => {
    const key = await importKey(newKeyBytes());
    await setOfflineSession("uid-a", key);
    await adoptEncryptedDrafts();
    setDraftCell("inst", "c1", "2026-10-05", "AM", "s1", E);
    await storedDrafts(1);

    setDraftOwner("uid-a"); // what a reload does to module state
    await setOfflineSession("uid-a", key);
    await adoptEncryptedDrafts();
    expect(getDraft("inst", "c1", "2026-10-05", "AM")).toEqual({ s1: E });
  });

  it("are removed from the store when one register is cleared", async () => {
    await setOfflineSession("uid-a", await importKey(newKeyBytes()));
    await adoptEncryptedDrafts();
    setDraftCell("inst", "c1", "2026-10-05", "AM", "s1", E);
    await storedDrafts(1);
    clearDraft("inst", "c1", "2026-10-05", "AM");
    expect(getDraft("inst", "c1", "2026-10-05", "AM")).toEqual({});
    await storedDrafts(0);
  });

  it("are gone from memory after clearAllDrafts", async () => {
    await setOfflineSession("uid-a", await importKey(newKeyBytes()));
    await adoptEncryptedDrafts();
    setDraftCell("inst", "c1", "2026-10-05", "AM", "s1", E);
    clearAllDrafts();
    expect(getDraft("inst", "c1", "2026-10-05", "AM")).toEqual({});
  });
});
