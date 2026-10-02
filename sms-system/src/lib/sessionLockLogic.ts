// Pure decisions behind the one-active-session lock (sessionLock.ts). Kept free
// of Firebase imports so they can be unit-tested. See that file for the lock's
// shape and why it lives in the Realtime Database.

// The record at /sessions/{uid}. startedAt is the database's server time (ms).
export type SessionRecord = { sessionId: string; startedAt: number } | null;

export type ClaimDecision =
  | 'claim' // no lock: take it
  | 'reclaim' // already this tab's own session (a reload): keep it
  | 'takeover' // someone else's, but an admin cleared sessions after it started
  | 'blocked'; // someone else's and still valid: refuse

// resetAtMs is users/{uid}.sessionResetAt (an administrator's "clear this
// account's session"), or null. A lock that started BEFORE that moment is
// treated as cleared.
export function decideClaim(
  existing: SessionRecord,
  mySessionId: string,
  resetAtMs: number | null,
): ClaimDecision {
  if (!existing || typeof existing.sessionId !== 'string') return 'claim';
  if (existing.sessionId === mySessionId) return 'reclaim';
  if (resetAtMs !== null && resetAtMs > existing.startedAt) return 'takeover';
  return 'blocked';
}

export type LockState =
  | 'mine' // the lock is this tab's
  | 'missing' // gone (a reload's disconnect firing late, or a network blip): re-assert it
  | 'taken'; // another session now holds it: this one must sign out

export function lockState(current: SessionRecord, mySessionId: string): LockState {
  if (!current || typeof current.sessionId !== 'string') return 'missing';
  return current.sessionId === mySessionId ? 'mine' : 'taken';
}

// Firestore Timestamp (or its restored form) -> epoch ms, or null.
export function toMillis(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis(): number }).toMillis();
  }
  return null;
}

export const SESSION_IN_USE_MESSAGE =
  'This account is already signed in on another device or browser tab. Sign out there first, or ask your administrator to clear the session.';

export const SESSION_TAKEN_MESSAGE =
  'You were signed out because this account was signed in somewhere else.';
