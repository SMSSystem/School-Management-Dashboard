// What the Students, Teachers and Spectators lists show about an account's first
// sign-in: whether a sign-in link has been emailed, and whether the person has
// already signed in and chosen their own password (mustChangePassword false). Pure,
// so the badge and its tests share one rule. The fields ride in the cached users
// list, so showing this costs no extra reads.

export type LoginLinkState = 'signed_in' | 'sent' | 'not_sent';

/** Milliseconds from a Firestore Timestamp (or a number); null for anything else. */
export function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const fn = (value as { toMillis?: unknown } | null)?.toMillis;
  if (typeof fn === 'function') {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * - signed_in: mustChangePassword is false (they set their own password);
 * - sent: still on the default password and a link has been emailed;
 * - not_sent: still on the default password, no link emailed;
 * - null: no first-sign-in record at all (an older account), so nothing is shown.
 */
export function loginLinkState(input: {
  mustChangePassword?: boolean;
  emailedAtMs?: number | null;
}): LoginLinkState | null {
  if (input.mustChangePassword === undefined) return null;
  if (input.mustChangePassword === false) return 'signed_in';
  return input.emailedAtMs != null ? 'sent' : 'not_sent';
}
