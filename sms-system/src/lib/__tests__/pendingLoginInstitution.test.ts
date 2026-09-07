import { describe, it, expect, beforeEach } from "vitest";
import {
  setPendingLoginInstitution,
  consumePendingLoginInstitution,
  doesInstitutionMatch,
  PLATFORM_ADMIN_SENTINEL,
} from "../pendingLoginInstitution";

// vitest runs under the 'node' environment — install a minimal in-memory
// sessionStorage, matching filterPersistence.test.ts's existing pattern.
function installFakeSessionStorage() {
  const store = new Map<string, string>();
  const fake: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
  (globalThis as unknown as { sessionStorage: Storage }).sessionStorage =
    fake as Storage;
}

describe("pendingLoginInstitution", () => {
  beforeEach(() => {
    installFakeSessionStorage();
  });

  it("returns null when nothing was set", () => {
    expect(consumePendingLoginInstitution()).toBeNull();
  });

  it("round-trips a value, then clears it on read", () => {
    setPendingLoginInstitution("inst-1");
    expect(consumePendingLoginInstitution()).toBe("inst-1");
    expect(consumePendingLoginInstitution()).toBeNull();
  });

  describe("doesInstitutionMatch", () => {
    it("matches a real institution id against the same resolved id", () => {
      expect(doesInstitutionMatch("inst-1", "inst-1")).toBe(true);
    });

    it("rejects a real institution id against a different resolved id", () => {
      expect(doesInstitutionMatch("inst-1", "inst-2")).toBe(false);
    });

    it('matches the Platform Administration sentinel only against the "*" sentinel', () => {
      expect(doesInstitutionMatch(PLATFORM_ADMIN_SENTINEL, "*")).toBe(true);
      expect(doesInstitutionMatch(PLATFORM_ADMIN_SENTINEL, "inst-1")).toBe(
        false,
      );
    });

    it('rejects a real institution id against the "*" resolved id (super_admin selecting a real institution)', () => {
      expect(doesInstitutionMatch("inst-1", "*")).toBe(false);
    });

    it("rejects against a null resolved id (not yet resolved)", () => {
      expect(doesInstitutionMatch("inst-1", null)).toBe(false);
    });
  });
});
