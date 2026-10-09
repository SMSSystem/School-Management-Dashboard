// Pure decisions for scripts/set-account-email.mjs (no I/O, so they can be unit tested
// from src/lib/__tests__/setAccountEmail.test.ts).

/** Roles whose sign-in address this script may change: the ones that have a default password. */
export const ALLOWED_ROLES = ['student', 'parent', 'regular_teacher', 'senior_teacher', 'spectator'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An address trimmed and lower-cased, or null when it is not a plausible address (at most 254 characters). */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** An address for the log screen: its first character and its domain, never the whole. */
export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return String(email);
  return email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
}

/**
 * What to do for one account.
 *  - blocked: the new address is not a valid address, or the account's role must not
 *    be changed with this script (institution_admin, super_admin and anything else);
 *  - nothing: both the Firebase Auth address and the Firestore document already hold it;
 *  - change: authChange / docChange say which side differs; the email cooldown
 *    (credentialsEmailedAt and credentialsEmailCount) is cleared whenever either does,
 *    because the earlier email went to a different address.
 * Addresses are compared after trimming and lower-casing.
 */
export function planEmailChange({ role, docEmail, authEmail, newEmail }) {
  const next = normalizeEmail(newEmail);
  if (!next) return { action: 'blocked', reason: 'the new address is not a valid email address' };
  if (!ALLOWED_ROLES.includes(role)) {
    return { action: 'blocked', reason: `role "${role}" is not one this script may change (${ALLOWED_ROLES.join(', ')})` };
  }
  const same = (a) => typeof a === 'string' && a.trim().toLowerCase() === next;
  const authChange = !same(authEmail);
  const docChange = !same(docEmail);
  if (!authChange && !docChange) return { action: 'nothing', email: next };
  return { action: 'change', email: next, authChange, docChange, clearCooldown: true };
}
