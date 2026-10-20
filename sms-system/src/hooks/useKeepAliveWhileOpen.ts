import { useEffect } from 'react';
import { noteActivity } from '@/lib/activityBus';

/** How often an open viewer tells the inactivity logout the person is still there. */
export const KEEP_ALIVE_PING_MS = 30 * 1000;
/** A viewer left open counts as activity for this long, then the normal timeout resumes. */
export const KEEP_ALIVE_CAP_MS = 15 * 60 * 1000;

/** Whether an open viewer should still be reporting activity `openForMs` after it opened. */
export function keepAliveStillCounts(openForMs: number): boolean {
  return openForMs < KEEP_ALIVE_CAP_MS;
}

/**
 * Call from a component that shows a PDF viewer (an iframe, whose mouse and keyboard events the page
 * cannot see): while it is mounted the person counts as active, for up to KEEP_ALIVE_CAP_MS, so reading a
 * long document does not end in a sign-out. After the cap the normal timeout applies.
 */
export function useKeepAliveWhileOpen(): void {
  useEffect(() => {
    const openedAt = Date.now();
    noteActivity();
    const id = setInterval(() => {
      if (!keepAliveStillCounts(Date.now() - openedAt)) {
        clearInterval(id);
        return;
      }
      noteActivity();
    }, KEEP_ALIVE_PING_MS);
    return () => clearInterval(id);
  }, []);
}
