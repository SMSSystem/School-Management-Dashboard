import { doesInstitutionMatch } from "@/lib/pendingLoginInstitution";

/**
 * What PostLoginInstitutionGate does once a sign-in has resolved, as a plain decision (components/
 * PostLoginInstitutionGate.tsx acts on it):
 *  - "dashboard": carry on to /dashboard (no login attempt just happened on this route, or the checks passed, or
 *    the institution could not be checked, which fails open)
 *  - "mismatch": the account does not belong to the institution the person picked
 *  - "deleted": the picked institution's document is confirmed gone (AuthContext read it at sign-in)
 *
 * `institutionExists` comes from AuthContext, which already reads the document while loading the profile, so the
 * gate no longer reads it a second time. `null` means there was nothing to check (super admin) or the read failed:
 * a failed read is not evidence that the institution was deleted.
 */
export type PostLoginDecision = "dashboard" | "mismatch" | "deleted";

export function decidePostLogin({
  pending,
  institutionId,
  institutionExists,
}: {
  pending: string | null;
  institutionId: string | null;
  institutionExists: boolean | null;
}): PostLoginDecision {
  if (pending === null) return "dashboard";
  if (!doesInstitutionMatch(pending, institutionId)) return "mismatch";
  if (institutionId && institutionId !== "*" && institutionExists === false) return "deleted";
  return "dashboard";
}
