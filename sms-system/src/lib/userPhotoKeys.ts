// Cache keys for the photos shown on list rows (lib/userPhoto.ts keeps them for LIST_STALE_MS; personal data, so the
// 'userPhoto' root is never persisted: queryPersistence.ts).
export const USER_PHOTO_ROOT = 'userPhoto';

export function userPhotoKey(institutionId: string | null | undefined, uid: string) {
  return [USER_PHOTO_ROOT, institutionId ?? '', uid] as const;
}

/**
 * True only when the person's document says they have no photo (`hasPhoto: false`, written with every photo upload,
 * removal and account creation). A document with no flag (an account from before it existed) is unknown, so its photo is
 * still read once. The backfill that set the flag on those has finished.
 */
export const hasNoPhoto = (user: Record<string, unknown>): boolean => user.hasPhoto === false;
