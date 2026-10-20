// Pure decisions for scripts/backfill-has-photo.mjs (no I/O, so they can be unit tested from
// src/lib/__tests__/hasPhotoFlag.test.ts). The Students and Teachers lists skip the photo read for a person whose
// users document says hasPhoto === false (src/lib/userPhotoKeys.ts); the app writes the flag with every photo upload,
// removal and account creation, and this sets it on accounts from before that.

/** The roles whose photo the Students and Teachers lists show. */
export const ROLES_WITH_PHOTO_LISTS = ['student', 'senior_teacher', 'regular_teacher'];

/** True when the account needs the flag: a role the lists show a photo for, and no hasPhoto field yet. */
export function needsPhotoFlag(user) {
  return ROLES_WITH_PHOTO_LISTS.includes(user.role) && user.hasPhoto === undefined;
}

/**
 * The accounts to update: { id, hasPhoto } for each one that needs the flag, where hasPhoto is whether the person has
 * a photo document. `photoUids` is the set of uids found to have one.
 */
export function planPhotoFlags(users, photoUids) {
  return users.filter(needsPhotoFlag).map((u) => ({ id: u.id, hasPhoto: photoUids.has(u.id) }));
}
