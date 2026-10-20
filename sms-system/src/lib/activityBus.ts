// A way for a part of the app that hides the person's activity from the page to say "they are still here":
// an open PDF viewer is an iframe, and mouse and keyboard events inside an iframe never reach the page's
// own listeners, so a person reading a report card for six minutes would be signed out mid-document.
// hooks/useInactivityLogout.ts listens; hooks/useKeepAliveWhileOpen.ts speaks.

type Listener = () => void;
const listeners = new Set<Listener>();

/** Tells the inactivity logout the person is active right now. */
export function noteActivity(): void {
  for (const l of listeners) l();
}

/** Subscribes to noteActivity(); returns the unsubscribe. */
export function onActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
