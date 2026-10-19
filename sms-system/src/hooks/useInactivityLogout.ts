import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/lib/ToastContext';
import { inactivityTimeoutMs } from '@/lib/inactivityTimeout';
import { inactivityState } from '@/lib/inactivityClock';
import { onActivity } from '@/lib/activityBus';

const TICK_MS = 1000;
// Things the person does. Mouse and keyboard events inside an iframe (a PDF viewer) never reach the page;
// those viewers report through lib/activityBus.ts instead (hooks/useKeepAliveWhileOpen.ts).
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
// Coming back to the tab is not activity, but it is the moment to look at the clock: a hidden tab's timers
// are throttled and a sleeping laptop's stop, so the tick may not have run for a long time.
const WAKE_EVENTS = ['focus', 'pageshow'] as const;

const warningMessage = (secondsLeft: number) =>
  `You'll be signed out in ${secondsLeft}s due to inactivity.`;

export function useInactivityLogout(): void {
  const { role, signOut } = useAuth();
  const { showToast, updateToast, dismissToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Per role (lib/inactivityTimeout.ts): 5 min for staff, 30 min for students and parents.
    const timeoutMs = inactivityTimeoutMs(role);
    if (timeoutMs === null) return;

    // When the person last did something. Compared with the clock on every tick and on every wake-up,
    // so a throttled or sleeping tab signs out as soon as it runs again instead of when its timer fires.
    let lastActivity = Date.now();
    let warningToastId: string | null = null;
    let signingOut = false;

    const clearWarning = () => {
      if (warningToastId) {
        dismissToast(warningToastId);
        warningToastId = null;
      }
    };

    const markActive = () => {
      if (signingOut) return;
      lastActivity = Date.now();
      clearWarning();
    };

    const check = async () => {
      if (signingOut) return;
      const { state, secondsLeft } = inactivityState(lastActivity, Date.now(), timeoutMs);
      if (state === 'expired') {
        signingOut = true;
        clearWarning();
        await signOut();
        navigate('/login', { replace: true });
        return;
      }
      if (state === 'warning') {
        if (warningToastId) {
          updateToast(warningToastId, { message: warningMessage(secondsLeft) });
        } else {
          warningToastId = showToast({
            message: warningMessage(secondsLeft),
            variant: 'warning',
            // no durationMs — sticky; cleared by markActive() (on activity) or by the sign-out itself
          });
        }
        return;
      }
      clearWarning();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const onWake = () => {
      void check();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    WAKE_EVENTS.forEach((e) => window.addEventListener(e, onWake));
    document.addEventListener('visibilitychange', onVisibility);
    const stopListening = onActivity(markActive);
    const tick = setInterval(() => void check(), TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
      WAKE_EVENTS.forEach((e) => window.removeEventListener(e, onWake));
      document.removeEventListener('visibilitychange', onVisibility);
      stopListening();
      clearInterval(tick);
      clearWarning();
    };
  }, [role, signOut, navigate, showToast, updateToast, dismissToast]);
}
