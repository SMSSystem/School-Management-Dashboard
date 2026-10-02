import type { Database, DatabaseReference } from 'firebase/database';
import { app, databaseUrl, SINGLE_SESSION_ENABLED } from './firebase';
import {
  decideClaim,
  lateClaimAction,
  lockState,
  shouldArmDisconnect,
  type SessionRecord,
} from './sessionLockLogic';

// One active session per account, kept in the Realtime Database at
// /sessions/{uid} = { sessionId, startedAt }. Realtime Database (not Firestore)
// because its onDisconnect() makes the SERVER release the lock the moment this
// tab's connection ends (tab closed, crashed or offline), where a Firestore
// document would need a heartbeat and could stay locked for minutes.
//
// This is a client-side check: Firebase Auth still authenticates a second
// sign-in, then this code signs it back out. Without Cloud Functions it cannot
// be enforced by the server, so it stops casual credential sharing, not someone
// calling Firebase's REST API directly. It FAILS OPEN: if the database cannot be
// reached (or is slow), sign-in proceeds after CLAIM_TIMEOUT_MS rather than
// locking everyone out.

type Rtdb = typeof import('firebase/database');

const SESSION_ID_KEY = 'sms_session_id';
const CLAIM_TIMEOUT_MS = 5_000;
const RELEASE_TIMEOUT_MS = 3_000;

// Stable for the life of the tab (sessionStorage), so a reload re-claims its own
// lock instead of being blocked by it.
export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, fresh);
    return fresh;
  } catch {
    // sessionStorage unavailable: a per-load id still works, a reload just can't re-claim.
    return crypto.randomUUID();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type ActiveLock = { mod: Rtdb; lockRef: DatabaseReference; sessionId: string; stop: () => void };
let active: ActiveLock | null = null;

// Bumped by every claim and every release. A claim that timed out can still
// commit later; comparing its token to this tells whether it is still the
// current claim (attach it) or was superseded (take it back out).
let claimToken = 0;

async function load() {
  // Loaded on demand so the (sizeable) database SDK is not in the main bundle
  // for environments that do not use the lock.
  const mod = await import('firebase/database');
  return { mod, database: mod.getDatabase(app, databaseUrl) };
}

// Removes the lock, but only while it is still this session's own.
async function removeIfMine(mod: Rtdb, lockRef: DatabaseReference, sessionId: string): Promise<void> {
  try {
    await mod.runTransaction(lockRef, (existing) =>
      lockState(existing as SessionRecord, sessionId) === 'mine' ? null : undefined,
    );
  } catch {
    // Non-fatal: the disconnect handler or the next sign-in clears it.
  }
}

// Sets the committed lock up: arms the server-side "remove on disconnect" handler,
// re-asserts the lock after a reconnect, and signs this session out if another
// one displaces it. Only ever called for a lock that is THIS session's.
async function attach(
  mod: Rtdb,
  database: Database,
  lockRef: DatabaseReference,
  sessionId: string,
  onLost: () => void,
): Promise<void> {
  // Awaited, so the server holds the handler before sign-in carries on: a tab
  // closed right after signing in still frees the account.
  try {
    await mod.onDisconnect(lockRef).remove();
  } catch {
    // Best effort: re-armed on the next reconnect.
  }

  const reassert = async () => {
    try {
      const result = await mod.runTransaction(lockRef, (current) =>
        lockState(current as SessionRecord, sessionId) === 'missing'
          ? { sessionId, startedAt: mod.serverTimestamp() }
          : undefined,
      );
      // A disconnect handler does not survive a dropped connection, so it is
      // re-armed on every reconnect, but ONLY once the lock is confirmed ours:
      // armed on another session's lock it would delete that session when this
      // tab later closes.
      if (shouldArmDisconnect(lockState(result.snapshot.val() as SessionRecord, sessionId))) {
        void mod.onDisconnect(lockRef).remove();
      }
    } catch {
      // Best effort: the next change to the lock (or reconnect) tries again.
    }
  };

  let lost = false;
  // Declared before the listeners (which may fire at once) and assigned below.
  let stop: () => void = () => {};
  const stopConnected = mod.onValue(mod.ref(database, '.info/connected'), (snap) => {
    if (snap.val() === true) void reassert();
  });
  const stopLock = mod.onValue(lockRef, (snap) => {
    const state = lockState(snap.val() as SessionRecord, sessionId);
    if (state === 'taken' && !lost) {
      lost = true;
      stop();
      // The handler armed earlier would otherwise remove the NEW session's lock
      // when this tab's connection ends.
      void mod.onDisconnect(lockRef).cancel().catch(() => undefined);
      onLost();
    } else if (state === 'missing') {
      // A reload's old tab can fire its disconnect handler just after this one claimed: put it back.
      void reassert();
    }
  });

  stop = () => {
    stopConnected();
    stopLock();
    if (active?.lockRef === lockRef) active = null;
  };
  active = { mod, lockRef, sessionId, stop };
}

// Claims the account's session for this tab. Returns false ONLY when another
// live session holds it (the caller signs the user back out). onLost fires once
// if this session is later displaced (an administrator cleared it and someone
// else signed in).
export async function claimSession(
  uid: string,
  resetAtMs: number | null,
  onLost: () => void,
): Promise<boolean> {
  if (!SINGLE_SESSION_ENABLED) return true;
  active?.stop();

  const token = ++claimToken;
  const sessionId = getSessionId();
  let mod: Rtdb;
  let database: Database;
  let lockRef: DatabaseReference;
  let pending: ReturnType<Rtdb['runTransaction']>;
  try {
    ({ mod, database } = await load());
    lockRef = mod.ref(database, `sessions/${uid}`);
    // Atomic: two sign-ins at the same moment cannot both win.
    pending = mod.runTransaction(lockRef, (current) => {
      const decision = decideClaim(current as SessionRecord, sessionId, resetAtMs);
      if (decision === 'blocked') return undefined; // abort: leave the other session's lock alone
      return { sessionId, startedAt: mod.serverTimestamp() };
    });
  } catch (error) {
    console.warn('Session lock unavailable; continuing without it.', error);
    return true;
  }

  let committed: boolean;
  try {
    committed = (await withTimeout(pending, CLAIM_TIMEOUT_MS)).committed;
  } catch (error) {
    // Slow or unreachable database: let the user in (fail open). The claim may
    // still commit later; finish it properly, or take it back out if this sign-in
    // was superseded in the meantime, so it can never leave a lock nobody owns.
    console.warn('Session lock unavailable; continuing without it.', error);
    void pending
      .then(async (late) => {
        const action = lateClaimAction(late.committed, token !== claimToken);
        if (action === 'attach') await attach(mod, database, lockRef, sessionId, onLost);
        else if (action === 'release') await removeIfMine(mod, lockRef, sessionId);
      })
      .catch(() => undefined);
    return true;
  }
  if (!committed) return false;

  try {
    await attach(mod, database, lockRef, sessionId, onLost);
  } catch (error) {
    console.warn('Session lock could not be fully set up.', error);
  }
  return true;
}

// Gives the lock up (sign-out, inactivity logout). Call BEFORE signing out of
// Firebase Auth, which the database write needs. Never throws and never waits
// long; only removes a lock that is still this tab's own.
export async function releaseSession(): Promise<void> {
  claimToken++; // a claim still in flight is now stale
  const current = active;
  if (!current) return;
  active = null;
  current.stop();
  const { mod, lockRef, sessionId } = current;
  try {
    await withTimeout(
      (async () => {
        await mod.onDisconnect(lockRef).cancel();
        await removeIfMine(mod, lockRef, sessionId);
      })(),
      RELEASE_TIMEOUT_MS,
    );
  } catch {
    // Non-fatal: the disconnect handler or the next sign-in clears it.
  }
}
