// Shared name/phone validation patterns for user-facing account and
// registration forms. AdminCreateUserForm.tsx and the public registration
// form both validate against the same rules — this is the single source of
// truth so they can't silently drift apart.
export const namePattern = /^[\p{L}][\p{L}' -]*$/u;
export const phonePattern = /^\+?[0-9 ()-]{7,20}$/;
// Same shape login/index.tsx's own local EMAIL_RE already validates
// against — kept here too now that a second account-creation surface
// (importStudents.ts) needs it, rather than a third local copy.
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
