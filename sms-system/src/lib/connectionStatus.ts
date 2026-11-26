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
  listeners.forEach((l) => l());
}

export function getConnectionState(): ConnectionState {
  return state;
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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
