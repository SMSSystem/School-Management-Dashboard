import { isLoginLinkRole, type LoginLinkRole } from "@/lib/roleDefaultPasswords";

// The sign-in link in a first-login email:
//   <app url>/login/<institution id>/<role code>
// Both values are path segments (no query string, no fragment), so no mail
// program or link wrapper can drop them. Neither is a secret: the institution
// id is public (it is the registration directory's document id) and the role
// code only names a role. The password is NOT in the link; the login page looks
// the role's default up in code (INSTITUTION_LOGIN_EMAILS_SPEC.md §4).

export type LoginLink = { institutionId: string; code: LoginLinkRole };

// Firestore auto-ids are 20 alphanumeric characters; accept any plausible id
// without admitting path tricks.
const INSTITUTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function buildLoginLink(appUrl: string, institutionId: string, code: LoginLinkRole): string {
  return `${appUrl.replace(/\/+$/, "")}/login/${institutionId}/${code}`;
}

/** The link a route's params describe, or null (an unknown institution id or role code means the normal login). */
export function parseLoginLink(params: { institutionId?: string; role?: string }): LoginLink | null {
  const { institutionId, role } = params;
  if (!institutionId || !INSTITUTION_ID_RE.test(institutionId)) return null;
  if (!isLoginLinkRole(role)) return null;
  return { institutionId, code: role };
}
