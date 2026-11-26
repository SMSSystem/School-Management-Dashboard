// "Can't reach the server" state, shown by components/ConnectionBanner.tsx.
//
// Two signals set it:
//  1. the Firestore SDK's own warning, "Could not reach Cloud Firestore backend. Backend
//     didn't respond within 10 seconds…", which it logs at error level (picked up by
//     onLog in lib/firebase.ts). The SDK logs it only for the first failed connection of
//     a page session, never again after it has once connected, and never logs a reconnect;
//  2. the browser's own `offline` event, which covers a connection lost later on.
// It clears on the browser `online` event, on the next successful query (the query cache
// subscription in the banner), or when the user dismisses it. Pure and without a Firebase
// import, so tests can import it.

/** The part of the SDK message that is stable across versions. */
export const OFFLINE_LOG_FRAGMENT = 'Could not reach Cloud Firestore backend';

export function isFirestoreOfflineLog(message: unknown): boolean {
  return typeof message === 'string' && message.includes(OFFLINE_LOG_FRAGMENT);
}

export type ConnectionState = { offline: boolean; dismissed: boolean };

let state: ConnectionState = { offline: false, dismissed: false };
const listeners = new Set<() => void>();

function set(next: ConnectionState): void {
  if (next.offline === state.offline && next.dismissed === state.dismissed) return;
  state = next;
  notifyAll();
}

export function getConnectionState(): ConnectionState {
  return state;
}

// Subscribers also hear the browser's own `online`/`offline` events, even when they don't change `state`. A tab that
// started offline has `state.offline` false (no event fired, and the SDK warning may not have come yet), so when the
// connection returns `setOnline()` changes nothing and `set()` stays quiet; without this, anything reading
// `deviceOnline()`/`browserOnline()` through useSyncExternalStore would keep its stale offline answer.
const notifyAll = () => listeners.forEach((l) => l());
let browserEventsAttached = false;

function attachBrowserEvents(attach: boolean): void {
  if (typeof window === 'undefined' || attach === browserEventsAttached) return;
  const method = attach ? 'addEventListener' : 'removeEventListener';
  window[method]('online', notifyAll);
  window[method]('offline', notifyAll);
  browserEventsAttached = attach;
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  attachBrowserEvents(true);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) attachBrowserEvents(false);
  };
}

/** A new outage shows the banner again, even if an earlier one was dismissed. */
export function setOffline(): void {
  set({ offline: true, dismissed: state.offline ? state.dismissed : false });
}

export function setOnline(): void {
  set({ offline: false, dismissed: false });
}

export function dismissOffline(): void {
  set({ ...state, dismissed: true });
}

// Two answers to "are we online?", used across the app instead of reading navigator.onLine directly:
//  - browserOnline(): only the browser's opinion. For code that tries the network anyway and treats a failure as the
//    real signal (reads that fall back to a copy, the outbox sender, preloading code), where the banner's state could
//    be stale after the SDK warning and would block a try that would have worked.
//  - deviceOnline(): the browser's opinion and the banner's ("the app last reached its servers"). For what the person
//    sees and decides on (offline notices, Save buttons, the idle lock, updating the app).
// In React, read them through hooks/useDeviceOnline.ts, which re-renders on every change.

/** The browser doesn't say it's offline. */
export function browserOnline(): boolean {
  return !(typeof navigator !== "undefined" && navigator.onLine === false);
}

/** Online as the banner sees it: the browser says so and the app last reached its servers. */
export function deviceOnline(): boolean {
  return browserOnline() && !state.offline;
}

/** The banner is visible while offline and not dismissed. */
export function bannerVisible(s: ConnectionState): boolean {
  return s.offline && !s.dismissed;
}
