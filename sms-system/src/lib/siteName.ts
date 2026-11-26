// The name the app goes by for a person: their school's, or the generic one. The top bar shows it, and anything that
// names "this site" (the lock screen, the "You're leaving" dialog) uses the same rule through hooks/useSiteName.ts.
// Pure and without Firebase, for tests.

import type { Role } from "@/types/people";

/** The generic name, for a super admin (who isn't in one school) and before the school has loaded. */
const DEFAULT_SITE_NAME = "School Management";

export function siteNameFor(
  role: Role | null | undefined,
  institutionName: string | null | undefined,
): string {
  if (role === "super_admin") return DEFAULT_SITE_NAME;
  return institutionName ?? DEFAULT_SITE_NAME;
}
