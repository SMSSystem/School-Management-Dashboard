// The inactivity logout's decision, as a pure function of three times (hooks/useInactivityLogout.ts).
//
// The hook used to count with setTimeout. A background tab's timers are throttled (to once a minute after
// five minutes hidden, in Chrome) and a sleeping laptop stops them altogether, so a staff member who left
// a tab open at lunch could come back to a signed-in session long past the five minutes. The hook now
// remembers when the person last did something and asks this function, on a one second tick and again the
// moment the tab is shown, focused or restored, how long ago that was.

export type InactivityState = 'active' | 'warning' | 'expired';

/** How long before the sign-out the warning toast appears. */
export const WARNING_LEAD_MS = 10 * 1000;

export function inactivityState(
  lastActivityMs: number,
  nowMs: number,
  timeoutMs: number,
  warningLeadMs: number = WARNING_LEAD_MS,
): { state: InactivityState; secondsLeft: number } {
  // A clock set backwards is not inactivity.
  const idle = Math.max(0, nowMs - lastActivityMs);
  if (idle >= timeoutMs) return { state: 'expired', secondsLeft: 0 };
  const secondsLeft = Math.ceil((timeoutMs - idle) / 1000);
  if (idle >= timeoutMs - warningLeadMs) return { state: 'warning', secondsLeft };
  return { state: 'active', secondsLeft };
}
