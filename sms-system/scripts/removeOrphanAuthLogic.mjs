// Pure decisions for scripts/remove-orphan-auth-accounts.mjs (no I/O, so they can be
// unit tested from src/lib/__tests__/deleteUser.test.ts).

/** An account made less than this long ago may still be mid-creation (Auth first, profile second). */
export const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** One run may always remove this many accounts, however few the project has. */
export const MIN_ALLOWED_DELETIONS = 10;
/** Beyond MIN_ALLOWED_DELETIONS, one run may remove at most this share of all Auth accounts. */
export const MAX_DELETION_SHARE = 0.2;

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

/**
 * Null when removing `pickedCount` accounts looks sane, else the reason to stop. Two mistakes would turn this
 * script into "delete everyone": a --key for the wrong project (or a failed read) that finds no users documents,
 * so that every account looks like an orphan, and a project where far more accounts than expected have no
 * document. `--allow-large` (allowLarge) lifts the second check only; an empty users collection always stops it.
 */
export function checkDeletionSafety({ authCount, userDocCount, pickedCount, allowLarge = false }) {
  if (pickedCount === 0) return null;
  if (userDocCount === 0) {
    return 'The users collection returned no documents, so every account would look like an orphan. Check that --key is for the right project.';
  }
  const limit = Math.max(MIN_ALLOWED_DELETIONS, Math.ceil(authCount * MAX_DELETION_SHARE));
  if (pickedCount > limit && !allowLarge) {
    return `${pickedCount} of ${authCount} accounts would be removed, more than the ${limit} one run may remove (${MIN_ALLOWED_DELETIONS}, or ${MAX_DELETION_SHARE * 100}% of all accounts if that is more). Check the project; if this really is expected, run again with --allow-large.`;
  }
  return null;
}
