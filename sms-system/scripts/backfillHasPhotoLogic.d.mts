// Types for backfillHasPhotoLogic.mjs, so the TypeScript tests can import it.

export const ROLES_WITH_PHOTO_LISTS: string[];
export type UserRow = { id: string; role?: unknown; hasPhoto?: unknown };
export function needsPhotoFlag(user: UserRow): boolean;
export function planPhotoFlags(users: UserRow[], photoUids: ReadonlySet<string>): { id: string; hasPhoto: boolean }[];
