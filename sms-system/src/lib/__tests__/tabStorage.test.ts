import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readSessionJson,
  removeSessionItem,
  writeSessionJson,
} from "../offline/tabStorage";
import { createFakeStorage } from "./fakeStorage";

// The tab's own storage for small offline records (lib/offline/tabStorage.ts): never throws, and treats anything
// missing, damaged or blocked as nothing.

afterEach(() => vi.unstubAllGlobals());

describe("tab storage", () => {
  it("round-trips JSON, and removes it", () => {
    vi.stubGlobal("sessionStorage", createFakeStorage());
    expect(writeSessionJson("k", { a: 1 })).toBe(true);
    expect(readSessionJson("k")).toEqual({ a: 1 });
    removeSessionItem("k");
    expect(readSessionJson("k")).toBeNull();
  });

  it("reads a damaged value as nothing", () => {
    const storage = createFakeStorage();
    storage.setItem("k", "{not json");
    vi.stubGlobal("sessionStorage", storage);
    expect(readSessionJson("k")).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("sessionStorage", {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    expect(readSessionJson("k")).toBeNull();
    expect(writeSessionJson("k", 1)).toBe(false);
    expect(() => removeSessionItem("k")).not.toThrow();
  });
});
