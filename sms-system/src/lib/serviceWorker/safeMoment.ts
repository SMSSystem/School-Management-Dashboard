// When a new version of the app may take over (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice E): online,
// not locked, with no register draft and nothing unsent. Drafts and unsent saves would survive the reload, but a
// draft means someone is in the middle of marking, and the switch must never interrupt that.

import { hasAnyDraft } from "@/lib/attendanceDraft";
import { deviceOnline } from "@/lib/connectionStatus";
import { idleLockState } from "@/lib/offline/idleLock";
import { hasOutboxItems } from "@/lib/offline/outboxStore";

export type SafeMomentFacts = {
  online: boolean;
  locked: boolean;
  hasDrafts: boolean;
  hasUnsent: boolean;
};

export function isSafeMoment(f: SafeMomentFacts): boolean {
  return f.online && !f.locked && !f.hasDrafts && !f.hasUnsent;
}

export const isSignInPage = (path: string): boolean =>
  path === "/login" || path.startsWith("/login/");

/**
 * Whether this moment may switch versions, before the facts are checked:
 * - on the sign-in page with nobody signed in, only while nothing has been typed there, so a reload never wipes a
 *   half-typed email or password;
 * - otherwise at a page change, except the one straight after signing in, while the sign-in's background work (the
 *   offline unlock check, the device key, the sign-in log) may still be running. The next page change counts.
 */
export function isSwitchMoment(p: {
  prevPath: string;
  path: string;
  signedIn: boolean;
  formTouched: boolean;
}): boolean {
  if (isSignInPage(p.path) && !p.signedIn) return !p.formTouched;
  return p.prevPath !== p.path && !isSignInPage(p.prevPath);
}

/** The facts as they are now. Never throws. */
export async function safeMomentFacts(): Promise<SafeMomentFacts> {
  return {
    online: deviceOnline(),
    locked: idleLockState() !== null,
    hasDrafts: hasAnyDraft(),
    hasUnsent: await hasOutboxItems(),
  };
}
