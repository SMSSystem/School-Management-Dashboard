// Cache keys for the photos shown on list rows (lib/userPhoto.ts keeps them for LIST_STALE_MS; personal data, so the
// 'userPhoto' root is never persisted: queryPersistence.ts).
export const USER_PHOTO_ROOT = 'userPhoto';

export function userPhotoKey(institutionId: string | null | undefined, uid: string) {
  return [USER_PHOTO_ROOT, institutionId ?? '', uid] as const;
}
