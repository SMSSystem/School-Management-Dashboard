// Pure decisions for scripts/remove-orphan-auth-accounts.mjs (no I/O, so they can be
// unit tested from src/lib/__tests__/deleteUser.test.ts).

/** An account made less than this long ago may still be mid-creation (Auth first, profile second). */
export const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** An address for the screen: its first character and its domain, never the whole. */
export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return String(email);
  return email.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
}

/**
 * Which Firebase Auth accounts to remove: the ones with NO users/{uid} document
 * (the "Delete user" button removes the document, never the sign-in) and old enough
 * not to be an account still being created. `existingUids` is the set of uids that
 * have a document. With `onlyUid`, only that account is considered (still refused if
 * it has a document, or is too new).
 */
export function pickOrphans({ authUsers, existingUids, nowMs, onlyUid = null, minAgeMs = MIN_AGE_MS }) {
  const picked = [];
  const skipped = [];
  for (const u of authUsers) {
    if (onlyUid && u.uid !== onlyUid) continue;
    if (existingUids.has(u.uid)) {
      if (onlyUid) skipped.push({ uid: u.uid, reason: 'it still has a users document' });
      continue;
    }
    const created = Date.parse(u.creationTime ?? '');
    if (!Number.isFinite(created) || nowMs - created < minAgeMs) {
      skipped.push({ uid: u.uid, reason: 'created less than 24 hours ago (or no creation time)' });
      continue;
    }
    picked.push(u);
  }
  return { picked, skipped };
}
