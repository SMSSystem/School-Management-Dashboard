import { describe, expect, it } from "vitest";
import authSrc from "../AuthContext.tsx?raw";
import protectedSrc from "../../components/Protected.tsx?raw";
import purgeSrc from "../sessionPurge.ts?raw";
import rulesSrc from "../../../firestore.rules?raw";
import { flat } from "./sourceText";

// Offline start (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice A): a tab that can't reach the server
// carries on from its working copy, or waits, and never signs out because of an outage.

describe("starting a signed-in tab with no internet", () => {
  it("falls back to the working copy only when the profile read failed for being offline", () => {
    expect(flat(authSrc)).toContain(
      flat(
        "if (!isOfflineError(err, online())) throw err; await startOffline(uid); return null;",
      ),
    );
  });

  it("opens this tab's store and drafts before reading the profile, with no network", () => {
    const src = flat(authSrc);
    const store = src.indexOf(
      flat(
        "await setOfflineSession(firebaseUser.uid, await storedSessionKey(firebaseUser.uid));",
      ),
    );
    const drafts = src.indexOf(flat("await adoptEncryptedDrafts();"));
    const profile = src.indexOf(flat("await fetchRoleRef.current(firebaseUser.uid);"));
    expect(store).toBeGreaterThan(-1);
    expect(store).toBeLessThan(drafts);
    expect(drafts).toBeLessThan(profile);
  });

  it("keeps a working copy only for the roles that work offline", () => {
    expect(flat(authSrc)).toContain(
      flat("if (!worksOffline(fetchedRole)) return;"),
    );
  });

  it("tries the server again when the connection returns", () => {
    expect(flat(authSrc)).toContain(
      flat("window.addEventListener('online', retry);"),
    );
  });

  it("shows why it is waiting rather than an empty dashboard", () => {
    expect(flat(protectedSrc)).toContain(
      flat("if (offlineStart === 'blocked') {"),
    );
  });

  it("removes the working copies and the key at sign-out", () => {
    expect(purgeSrc).toContain("purgeOfflineStore();");
    expect(purgeSrc).toContain("forgetSessionKey();");
  });

  it("protects the key document with its own rule", () => {
    expect(rulesSrc).toContain("match /users/{uid}/deviceKeys/{keyId} {");
    expect(rulesSrc).toContain("allow update, delete: if false;");
  });
});
