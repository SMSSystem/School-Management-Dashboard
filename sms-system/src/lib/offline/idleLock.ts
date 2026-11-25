// The offline idle lock's state (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice D). When staff who work
// offline go idle while the device is offline, the tab locks instead of signing out: a sign-out then would delete the
// device's drafts and reload to a sign-in page that can't load. The state lives in the tab's sessionStorage, so a
// reload stays locked, and the sign-out purge deletes it. No Firebase import.

import type { Role } from "@/types/people";
import { worksOffline } from "./offlineStart";

export const IDLE_LOCK_STORAGE = "sms_idle_lock";

/** Wrong passwords allowed before the lock signs out (keeping unsent saves, which the purge never deletes). */
export const MAX_UNLOCK_FAILURES = 5;

/**
 * How long a locked tab may stay online before it signs out. A locked tab keeps the account's single session
 * (lib/sessionLock.ts), so without this limit the person couldn't sign in on another device until the tab was closed.
 */
export const LOCKED_ONLINE_LIMIT_MS = 30 * 60 * 1000;

/** `onlineSince`: when the locked tab last came back online; absent while it's offline. */
export type IdleLockState = {
  uid: string;
  failures: number;
  onlineSince?: number;
};

const listeners = new Set<() => void>();
let cached: IdleLockState | null | undefined;

const countOrZero = (value: unknown): number =>
  typeof value === "number" && value >= 0 ? Math.floor(value) : 0;

function read(): IdleLockState | null {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(IDLE_LOCK_STORAGE) ?? "null",
    ) as Partial<IdleLockState> | null;
    if (!parsed || typeof parsed.uid !== "string") return null;
    const state: IdleLockState = {
      uid: parsed.uid,
      failures: countOrZero(parsed.failures),
    };
    if (Number.isFinite(parsed.onlineSince))
      state.onlineSince = parsed.onlineSince;
    return state;
  } catch {
    return null;
  }
}

function write(next: IdleLockState | null): void {
  try {
    if (next) sessionStorage.setItem(IDLE_LOCK_STORAGE, JSON.stringify(next));
    else sessionStorage.removeItem(IDLE_LOCK_STORAGE);
  } catch {
    // Without storage the lock lasts until a reload, as the session itself does.
  }
  cached = next;
  for (const listener of listeners) listener();
}

/** The lock, or null when the tab isn't locked. Stable between changes, for useSyncExternalStore. */
export function idleLockState(): IdleLockState | null {
  if (cached === undefined) cached = read();
  return cached;
}

export function subscribeIdleLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Locks this tab for this person. */
export function lockTab(uid: string): void {
  write({ uid, failures: idleLockState()?.failures ?? 0 });
}

/** Counts a wrong password. Returns how many there have been. */
export function recordFailure(): number {
  const state = idleLockState();
  if (!state) return 0;
  const failures = state.failures + 1;
  write({ ...state, failures });
  return failures;
}

/** Notes that the locked tab is online, from `now` unless it already was. Kept in storage, so a reload doesn't restart the count. */
export function markOnline(now: number): void {
  const state = idleLockState();
  if (!state || state.onlineSince !== undefined) return;
  write({ ...state, onlineSince: now });
}

/** Notes that the locked tab is offline again: the count starts afresh when it's next online. */
export function markOffline(): void {
  const state = idleLockState();
  if (!state || state.onlineSince === undefined) return;
  write({ uid: state.uid, failures: state.failures });
}

/** Whether a locked tab has been online for the whole limit, so it should sign out and free the account's session. */
export function lockedTooLongOnline(
  state: IdleLockState | null,
  now: number,
): boolean {
  if (state?.onlineSince === undefined) return false;
  return now - state.onlineSince >= LOCKED_ONLINE_LIMIT_MS;
}

/** Unlocks this tab. Also called by the sign-out purge. */
export function unlockTab(): void {
  write(null);
}

/** Test seam: forget the cached state so the next read comes from storage, as after a reload. */
export function resetIdleLockCacheForTests(): void {
  cached = undefined;
}

/**
 * What the lock screen does after a password check: unlock on the right password; sign out when there's nothing to
 * check against or the wrong passwords reached the limit; otherwise let the person try again.
 */
export function afterPasswordCheck(
  result: "ok" | "wrong" | "none",
  failures: number,
): "unlock" | "sign-out" | "retry" {
  if (result === "ok") return "unlock";
  if (result === "none" || failures >= MAX_UNLOCK_FAILURES) return "sign-out";
  return "retry";
}

/**
 * What an idle timeout does: staff who work offline lock while the device is offline; everyone else, and everyone
 * online, is signed out as before.
 */
export function idleAction(p: {
  role: Role | null | undefined;
  offline: boolean;
}): "lock" | "sign-out" {
  return p.offline && worksOffline(p.role) ? "lock" : "sign-out";
}
