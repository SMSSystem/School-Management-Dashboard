import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const TIMEOUT_MS = 5 * 60 * 1000;
const WATCHED_EVENTS = [
  'mousemove', 'keydown', 'click', 'scroll', 'touchstart',
] as const;
const AFFECTED_ROLES = [
  'super_admin', 'institution_admin', 'senior_teacher', 'regular_teacher',
] as const;

export function useInactivityLogout(): void {
  const { role, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!role || !(AFFECTED_ROLES as readonly string[]).includes(role)) return;

    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await signOut();
        navigate('/login', { replace: true });
      }, TIMEOUT_MS);
    };

    WATCHED_EVENTS.forEach((e) =>
      window.addEventListener(e, reset, { passive: true })
    );
    reset(); // arm the timer on mount

    return () => {
      clearTimeout(timer);
      WATCHED_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [role, signOut, navigate]);
}
