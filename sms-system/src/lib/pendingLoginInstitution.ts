// One-shot signal from LoginFormView to PostLoginInstitutionGate: "the user
// picked this institution (or the Platform Administration sentinel) right
// before attempting to sign in." Written immediately before signIn() is
// called, consumed at most once, cleared regardless of outcome — see
// LOGIN_SPEC.md §14.2 for why this can't just be a LoginFormView-local
// effect watching AuthContext state.

const KEY = "sms_pending_login_institution";

export const PLATFORM_ADMIN_SENTINEL = "__platform_admin__";

export function setPendingLoginInstitution(value: string): void {
  try {
    sessionStorage.setItem(KEY, value);
  } catch {
    // sessionStorage unavailable (e.g. private browsing edge cases) — the
    // gate's "nothing present" branch degrades to today's behavior
    // (navigate straight to /dashboard, no mismatch check), not a crash.
  }
}

/** Reads and clears the key in one call — a second read always sees nothing. */
export function consumePendingLoginInstitution(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}

/**
 * True if `selected` (an institution id, or PLATFORM_ADMIN_SENTINEL) is
 * consistent with `resolvedInstitutionId` (AuthContext's post-auth
 * institutionId — a real id, or '*' for super_admin, or null if not yet
 * resolved).
 */
export function doesInstitutionMatch(
  selected: string,
  resolvedInstitutionId: string | null,
): boolean {
  if (selected === PLATFORM_ADMIN_SENTINEL)
    return resolvedInstitutionId === "*";
  return selected === resolvedInstitutionId;
}
