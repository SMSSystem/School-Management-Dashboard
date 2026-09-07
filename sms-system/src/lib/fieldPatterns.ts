// Shared name/phone validation patterns for user-facing account and
// registration forms. AdminCreateUserForm.tsx and the public registration
// form both validate against the same rules — this is the single source of
// truth so they can't silently drift apart.
export const namePattern = /^[\p{L}][\p{L}' -]*$/u;
export const phonePattern = /^\+?[0-9 ()-]{7,20}$/;
