import { describe, expect, it } from "vitest";
import authSrc from "../AuthContext.tsx?raw";
import purgeSrc from "../sessionPurge.ts?raw";
import hookSrc from "../../hooks/useInactivityLogout.ts?raw";
import protectedSrc from "../../components/Protected.tsx?raw";
import gateSrc from "../../components/IdleLockGate.tsx?raw";
import screenSrc from "../../components/IdleLockScreen.tsx?raw";
import changePasswordSrc from "../../scenes/(auth)/change-password/index.tsx?raw";
import { lockScreenText } from "../offline/idleLockText";
import { flat } from "./sourceText";

// The offline idle lock's wiring (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice D).

describe("idle lock wiring", () => {
  it("keeps a verifier of the password at sign-in, and refreshes it when the password changes", () => {
    expect(flat(authSrc)).toContain(
      flat("void createVerifier(credential.user.uid, password);"),
    );
    expect(flat(changePasswordSrc)).toContain(
      flat("void createVerifier(user.uid, newPassword);"),
    );
  });

  it("forgets the verifier and the lock at sign-out", () => {
    expect(flat(purgeSrc)).toContain(flat("forgetVerifier(); unlockTab();"));
  });

  it("locks only when idleAction says so, and stops the timer while locked", () => {
    expect(flat(hookSrc)).toContain(
      flat(
        "if (uid && idleAction({ role, offline: deviceOffline() }) === 'lock') { lockTab(uid); return; }",
      ),
    );
    expect(flat(hookSrc)).toContain(
      flat("if (timeoutMs === null || locked) return;"),
    );
  });

  it("replaces the whole dashboard with the lock screen while locked, so the page's data is unmounted", () => {
    expect(flat(protectedSrc)).toContain(
      flat("return <IdleLockGate>{children}</IdleLockGate>;"),
    );
    expect(flat(gateSrc)).toContain(
      flat(
        "if (!lock || !user || stale) return <>{children}</>; return <IdleLockScreen uid={user.uid} />;",
      ),
    );
  });

  it("loads the lock screen with the app, never on demand: it shows when the device is offline", () => {
    expect(gateSrc).toContain(
      'import IdleLockScreen from "@/components/IdleLockScreen";',
    );
    expect(gateSrc).not.toMatch(/lazy\(/);
  });

  it("signs out after too many wrong passwords, or once back online when the tab has no verifier", () => {
    expect(flat(screenSrc)).toContain(
      flat("const next = afterPasswordCheck(result, failures);"),
    );
    expect(flat(screenSrc)).toContain(flat('if (next === "sign-out") {'));
    expect(flat(screenSrc)).toContain(
      flat("if (!canUnlock && online) leave();"),
    );
  });

  it("signs out a tab left locked online for thirty minutes, so the account's session is freed", () => {
    const screen = flat(screenSrc);
    expect(screen).toContain(flat("useOnlineSignOut(online, leave);"));
    expect(screen).toContain(
      flat("if (lockedTooLongOnline(idleLockState(), Date.now())) leave();"),
    );
    expect(screen).toContain(flat("markOnline(Date.now());"));
    expect(screen).toContain(flat("markOffline();"));
  });

  it("locks the forced change-password page too, since its inactivity guard can lock the tab", () => {
    expect(flat(protectedSrc)).toContain(
      flat(
        "<IdleLockGate> <InactivityGuard /> <ChangePasswordPage /> </IdleLockGate>",
      ),
    );
  });
});

describe("lock screen wording", () => {
  it("counts the tries left in plain words", () => {
    expect(lockScreenText.wrong(1)).toBe(
      "Wrong password. 1 try left before you're signed out.",
    );
    expect(lockScreenText.wrong(3)).toBe(
      "Wrong password. 3 tries left before you're signed out.",
    );
    expect(lockScreenText.triesLeft(1)).toBe("1 try left.");
  });

  it("warns what signing out loses, and that the sign-in page needs the connection", () => {
    expect(lockScreenText.signOutWarning(true)).toMatch(
      /Unsent register saves are kept/,
    );
    expect(lockScreenText.signOutWarning(true)).not.toMatch(/won't open/);
    expect(lockScreenText.signOutWarning(false)).toMatch(
      /won't open until you're back online/,
    );
  });
});
