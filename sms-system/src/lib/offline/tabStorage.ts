// The tab's own storage (sessionStorage) for small offline records: the device key (sessionKey.ts), the unlock
// verifier (unlockVerifier.ts) and the idle lock (idleLock.ts). sessionStorage goes when the tab closes, which is the
// point: these records must never outlive the tab's sign-in. Storage can be blocked (private modes, policies) or hold
// a damaged value, so nothing here throws; callers check the shape of what they get and treat null as "none".
// No Firebase import, so the sign-out purge can use it cheaply.

/** The parsed JSON stored under `key`, or null when it's missing, damaged or storage is blocked. */
export function readSessionJson(key: string): unknown {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as unknown;
  } catch {
    return null;
  }
}

/** Stores `value` as JSON under `key`. Returns whether it was kept. */
export function writeSessionJson(key: string, value: unknown): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Removes `key`. Without storage there is nothing to remove, and the tab's storage goes when it closes anyway. */
export function removeSessionItem(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
