// How long a signed-in user may be inactive before the app signs them out
// (hooks/useInactivityLogout.ts). Staff keep the short 5-minute window; students
// and parents get a longer one, because they read and fill things in for longer
// stretches. Every role has one: an idle tab that is never closed would otherwise
// hold the account's one-active-session lock (lib/sessionLock.ts) indefinitely.

export const STAFF_INACTIVITY_MS = 5 * 60 * 1000;
export const LEARNER_INACTIVITY_MS = 30 * 60 * 1000;

// spectator reads the same personal data as an institution admin, so it gets the
// short staff window too.
const STAFF_ROLES = ['super_admin', 'institution_admin', 'senior_teacher', 'regular_teacher', 'spectator'];
const LEARNER_ROLES = ['student', 'parent'];

// null for a role with no timeout (none today besides "not signed in").
export function inactivityTimeoutMs(role: string | null | undefined): number | null {
  if (!role) return null;
  if (STAFF_ROLES.includes(role)) return STAFF_INACTIVITY_MS;
  if (LEARNER_ROLES.includes(role)) return LEARNER_INACTIVITY_MS;
  return null;
}
