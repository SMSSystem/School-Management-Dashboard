import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/lib/ToastContext';

const TIMEOUT_MS = 5 * 60 * 1000;
const WARNING_LEAD_MS = 10 * 1000; // show the toast 10s before the actual logout
const WATCHED_EVENTS = [
  'mousemove', 'keydown', 'click', 'scroll', 'touchstart',
] as const;
const AFFECTED_ROLES = [
  'super_admin', 'institution_admin', 'senior_teacher', 'regular_teacher',
] as const;

const warningMessage = (secondsLeft: number) =>
  `You'll be signed out in ${secondsLeft}s due to inactivity.`;

export function useInactivityLogout(): void {
  const { role, signOut } = useAuth();
  const { showToast, updateToast, dismissToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!role || !(AFFECTED_ROLES as readonly string[]).includes(role)) return;

    let warningTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;
    let tickInterval: ReturnType<typeof setInterval>;
    let warningToastId: string | null = null;

    const clearAll = () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      clearInterval(tickInterval);
      if (warningToastId) {
        dismissToast(warningToastId);
        warningToastId = null;
      }
    };

    const reset = () => {
      clearAll();

      warningTimer = setTimeout(() => {
        let secondsLeft = WARNING_LEAD_MS / 1000;
        warningToastId = showToast({
          message: warningMessage(secondsLeft),
          variant: 'warning',
          // no durationMs — sticky; cleared explicitly by clearAll() (on activity) or by the logout itself
        });
        tickInterval = setInterval(() => {
          secondsLeft -= 1;
          if (warningToastId && secondsLeft > 0) {
            updateToast(warningToastId, {
              message: warningMessage(secondsLeft),
            });
          }
        }, 1000);
      }, TIMEOUT_MS - WARNING_LEAD_MS);

      logoutTimer = setTimeout(async () => {
        clearInterval(tickInterval);
        if (warningToastId) dismissToast(warningToastId);
        await signOut();
        navigate('/login', { replace: true });
      }, TIMEOUT_MS);
    };

    WATCHED_EVENTS.forEach((e) =>
      window.addEventListener(e, reset, { passive: true })
    );
    reset(); // arm on mount

    return () => {
      WATCHED_EVENTS.forEach((e) => window.removeEventListener(e, reset));
      clearAll();
    };
  }, [role, signOut, navigate, showToast, updateToast, dismissToast]);
}
