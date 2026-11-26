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

/** The facts as they are now. Never throws. */
export async function safeMomentFacts(): Promise<SafeMomentFacts> {
  return {
    online: deviceOnline(),
    locked: idleLockState() !== null,
    hasDrafts: hasAnyDraft(),
    hasUnsent: await hasOutboxItems(),
  };
}
