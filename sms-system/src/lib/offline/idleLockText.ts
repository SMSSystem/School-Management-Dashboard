// The offline idle lock screen's wording (components/IdleLockScreen.tsx, slice D). Kept apart so it can be tested
// and read in one place.

export const lockScreenText = {
  title: "Locked",
  intro:
    "You were away while offline, so the screen locked. Enter your password to carry on.",
  unlock: "Unlock",
  checking: "Checking…",
  signingOut: "Signing out…",
  noVerifier:
    "This tab can't be unlocked offline. Reconnect to the internet to continue: you'll be signed out, and unsent register saves are kept for your next sign-in.",
  wrong: (left: number) =>
    left === 1
      ? "Wrong password. 1 try left before you're signed out."
      : `Wrong password. ${left} tries left before you're signed out.`,
  triesLeft: (left: number) => `${left} ${left === 1 ? "try" : "tries"} left.`,
  signOutWarning: (online: boolean) =>
    "Signing out deletes this device's unsaved drafts. Unsent register saves are kept and sent at your next sign-in." +
    (online ? "" : " The sign-in page won't open until you're back online."),
};
