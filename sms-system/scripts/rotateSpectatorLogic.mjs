// Pure decisions for scripts/rotate-spectator-default-passwords.mjs (no I/O, so they can be unit
// tested from src/lib/__tests__/rotateSpectator.test.ts).

/** Firebase Auth's own minimum is 6; the app asks for more, so insist on 12. */
export const MIN_PASSWORD_LENGTH = 12;

/** An address for the screen: its first character and its domain, never the whole. */
export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return String(email);
  return email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
}

/** An institution id as a single Firestore document id: no slashes, dots or spaces. */
export function isSafeInstitutionId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** Null when the password is acceptable, else the reason it is not. */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'The password must contain a lower-case letter, an upper-case letter and a digit.';
  }
  return null;
}

/**
 * A random 16-character password of letters and digits (no look-alikes) with at least one of each kind.
 * `randomInt(n)` returns an integer in [0, n); the script passes node:crypto's.
 */
export function generatePassword(randomInt) {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = lower + upper + digits;
  const pick = (set) => set[randomInt(set.length)];
  const chars = [pick(lower), pick(upper), pick(digits)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Which spectator accounts still may hold the public default password: the ones that have never
 * been through the forced first-sign-in password change (`mustChangePassword === true`). That flag
 * is the only signal there is: the Admin SDK cannot compare a password. An account with the flag
 * unset or false chose its own password and is left alone, as is one with no Firebase Auth account.
 * `users` are `{ uid, role, mustChangePassword, institutionId, ... }`, `authUids` the uids that have
 * an Auth account. Returns `{ picked, skipped }`; `skipped` carries `{ uid, reason }` for the
 * spectators that were passed over for a reason worth printing.
 */
export function pickSpectators({ users, authUids }) {
  const picked = [];
  const skipped = [];
  for (const u of users) {
    if (u.role !== 'spectator') continue;
    if (u.mustChangePassword !== true) continue;
    if (!authUids.has(u.uid)) {
      skipped.push({ uid: u.uid, reason: 'it has no Firebase Auth account' });
      continue;
    }
    if (!isSafeInstitutionId(u.institutionId)) {
      skipped.push({ uid: u.uid, reason: 'its document has no usable institutionId' });
      continue;
    }
    picked.push(u);
  }
  return { picked, skipped };
}
