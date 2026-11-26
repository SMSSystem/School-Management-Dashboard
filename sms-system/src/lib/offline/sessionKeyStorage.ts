// Where a tab keeps its offline key (sessionKey.ts), with no Firebase import, so the sign-out purge can forget it
// without loading Firebase.

import { removeSessionItem } from "./tabStorage";

export const SESSION_KEY_STORAGE = "sms_offline_key";

/** Forgets this tab's copy of the key. Called at sign-out. Never throws. */
export function forgetSessionKey(): void {
  removeSessionItem(SESSION_KEY_STORAGE);
}
