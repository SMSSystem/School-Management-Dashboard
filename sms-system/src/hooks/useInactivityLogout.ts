import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/lib/ToastContext';
import { inactivityTimeoutMs } from '@/lib/inactivityTimeout';
import { inactivityState } from '@/lib/inactivityClock';
import { onActivity } from '@/lib/activityBus';
import { getConnectionState } from '@/lib/connectionStatus';
import { idleAction, idleLockState, lockTab, subscribeIdleLock } from '@/lib/offline/idleLock';

/** Offline as the connection banner sees it: the browser says so, or the app couldn't reach its servers. */
const deviceOffline = () =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) || getConnectionState().offline;

const TICK_MS = 1000;
// Things the person does. Mouse and keyboard events inside an iframe (a PDF viewer) never reach the page;
// those viewers report through lib/activityBus.ts instead (hooks/useKeepAliveWhileOpen.ts).
// Captured on the window, so scrolling or pressing inside an inner scroll container, a modal or a table counts too
// (scroll does not bubble).
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'wheel', 'pointerdown', 'touchstart'] as const;
const ACTIVITY_OPTIONS = { passive: true, capture: true } as const;
// Coming back to the tab is not activity, but it is the moment to look at the clock: a hidden tab's timers
// are throttled and a sleeping laptop's stop, so the tick may not have run for a long time.
const WAKE_EVENTS = ['focus', 'pageshow'] as const;

const warningMessage = (secondsLeft: number) =>
  `You'll be signed out in ${secondsLeft}s due to inactivity.`;

export function useInactivityLogout(): void {
  const { user, role, signOut } = useAuth();
  const { showToast, updateToast, dismissToast } = useToast();
  const navigate = useNavigate();
  // While the tab is locked (offline, slice D) nothing counts: the timer starts afresh once it is unlocked.
  const locked = useSyncExternalStore(subscribeIdleLock, idleLockState, idleLockState) !== null;

  // The functions the effect calls, kept in a ref: signOut is a new function on every render of the provider, and an
  // effect that depended on it would restart the timer (and the warning) each time the provider re-rendered.
  const latest = useRef({ signOut, navigate, showToast, updateToast, dismissToast, uid: user?.uid });
  useEffect(() => {
    latest.current = { signOut, navigate, showToast, updateToast, dismissToast, uid: user?.uid };
  });

  useEffect(() => {
    // Per role (lib/inactivityTimeout.ts): 5 min for staff, 30 min for students and parents.
    const timeoutMs = inactivityTimeoutMs(role);
    if (timeoutMs === null || locked) return;

    // When the person last did something. Compared with the clock on every tick and on every wake-up,
    // so a throttled or sleeping tab signs out as soon as it runs again instead of when its timer fires.
    let lastActivity = Date.now();
    let warningToastId: string | null = null;
    let signingOut = false;

    const clearWarning = () => {
      if (warningToastId) {
        latest.current.dismissToast(warningToastId);
        warningToastId = null;
      }
    };

    const check = async () => {
      if (signingOut) return;
      const { state, secondsLeft } = inactivityState(lastActivity, Date.now(), timeoutMs);
      if (state === 'expired') {
        signingOut = true;
        clearWarning();
        // Staff who work offline lock instead while the device is offline (slice D): a sign-out then would delete the
        // device's drafts and reload to a sign-in page that can't load. The lock screen replaces the page.
        const uid = latest.current.uid;
        if (uid && idleAction({ role, offline: deviceOffline() }) === 'lock') {
          lockTab(uid);
          return;
        }
        try {
          await latest.current.signOut();
          latest.current.navigate('/login', { replace: true });
        } catch (err) {
          // Still signed in: try again on the next tick instead of leaving the session open and the timer stopped.
          signingOut = false;
          console.warn('Inactivity sign-out did not finish; trying again', err);
        }
        return;
      }
      if (state === 'warning') {
        if (warningToastId) {
          latest.current.updateToast(warningToastId, { message: warningMessage(secondsLeft) });
        } else {
          warningToastId = latest.current.showToast({
            message: warningMessage(secondsLeft),
            variant: 'warning',
            // no durationMs — sticky; cleared by markActive() (on activity) or by the sign-out itself
          });
        }
        return;
      }
      clearWarning();
    };

    // Activity after the deadline must not revive a session that has already run out (a laptop that slept, then a
    // key press that arrives before the tick or the wake-up check): judge the clock first.
    const markActive = () => {
      if (signingOut) return;
      if (inactivityState(lastActivity, Date.now(), timeoutMs).state === 'expired') {
        void check();
        return;
      }
      lastActivity = Date.now();
      clearWarning();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onWake = () => {
      void check();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, ACTIVITY_OPTIONS));
    WAKE_EVENTS.forEach((e) => window.addEventListener(e, onWake));
    document.addEventListener('visibilitychange', onVisibility);
    const stopListening = onActivity(markActive);
    const tick = setInterval(() => void check(), TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive, ACTIVITY_OPTIONS));
      WAKE_EVENTS.forEach((e) => window.removeEventListener(e, onWake));
      document.removeEventListener('visibilitychange', onVisibility);
      stopListening();
      clearInterval(tick);
      clearWarning();
    };
  }, [role, locked]);
}
