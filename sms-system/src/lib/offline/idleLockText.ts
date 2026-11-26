// The offline lock's wording (components/IdleLockScreen.tsx and components/LockButton.tsx, slice D). Kept apart so it
// can be tested and read in one place. The first line says why the screen locked (lib/offline/idleLock.ts
// IdleLockReason); add a case there and here together.

import type { IdleLockReason } from "./idleLock";

export const lockScreenText = {
  title: "Locked",
  intro: (reason: IdleLockReason) =>
    reason === "manual"
      ? "You locked the screen. Enter your password to carry on."
      : "You were away while offline, so the screen locked. Enter your password to carry on.",
  /** The countdown before an idle timeout: staff who work offline lock while offline, everyone else signs out. */
  idleWarning: (secondsLeft: number, action: "lock" | "sign-out") =>
    action === "lock"
      ? `The screen will lock in ${secondsLeft}s due to inactivity.`
      : `You'll be signed out in ${secondsLeft}s due to inactivity.`,
  lockButton: "Lock",
  lockButtonLabel: "Lock the screen",
  unlock: "Unlock",
  checking: "Checking…",
  signingOut: "Signing out…",
  noVerifier:
    "This tab can't be unlocked offline. Reconnect to the internet to continue: you'll be signed out, and unsent register saves are kept for your next sign-in.",
  wrong: (left: number) =>
    left === 1
      ? "Wrong password. 1 try left before you're signed out."
      : `Wrong password. ${left} tries left before you're signed out.`,
  onlineLimit:
    "You're back online. Unlock within 30 minutes, or you'll be signed out so you can sign in on another device. Unsent register saves are kept.",
  triesLeft: (left: number) => `${left} ${left === 1 ? "try" : "tries"} left.`,
  signOutWarning: (online: boolean) =>
    "Signing out deletes this device's unsaved drafts. Unsent register saves are kept and sent at your next sign-in." +
    (online ? "" : " You can't sign in again until you're back online."),
};
