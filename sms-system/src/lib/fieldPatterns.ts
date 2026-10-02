// Shared name/phone validation patterns for user-facing account and
// registration forms. AdminCreateUserForm.tsx and the public registration
// form both validate against the same rules — this is the single source of
// truth so they can't silently drift apart.
export const namePattern = /^[\p{L}][\p{L}' -]*$/u;
// 7-15 digits (E.164 allows at most 15), an optional leading "+", and up to two
// separator characters ( space ( ) - ) between digits. Written without
// lookahead on purpose: firestore.rules (registrations) uses the same
// expression and Firestore's regex engine, RE2, has none. Keep the two
// identical (src/lib/__tests__/fieldPatterns.test.ts pins them together).
export const phonePattern = /^\+?([ ()-]{0,2}[0-9]){7,15}[ ()-]{0,2}$/;
// Same shape login/index.tsx's own local EMAIL_RE already validates
// against — kept here too now that a second account-creation surface
// (importStudents.ts) needs it, rather than a third local copy.
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
