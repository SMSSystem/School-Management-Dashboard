// Starting a signed-in tab with no internet (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice A). The tab
// keeps a working copy of the person's profile and institution, saved at its last online start. Offline, AuthContext
// starts from that copy instead of signing out; only a real answer from the server (no profile, inactive, a reset
// session) still signs out.

import type { Role } from "@/types/people";

/** The roles that work offline (registers and, later, the gradebook). Only they get a key and a working copy. */
const OFFLINE_ROLES: readonly Role[] = [
  "regular_teacher",
  "senior_teacher",
  "institution_admin",
];

export function worksOffline(role: Role | null | undefined): boolean {
  return !!role && OFFLINE_ROLES.includes(role);
}

/** The profile fields AuthContext uses. Nothing else of the user document is kept. */
const PROFILE_FIELDS = [
  "role",
  "institutionId",
  "name",
  "phone",
  "address",
  "status",
  "department",
  "emergencyContact",
  "linkedAccounts",
  "classId",
  "classIds",
  "classSubjects",
  "departmentId",
  "mustChangePassword",
] as const;

export type ProfileFields = Partial<
  Record<(typeof PROFILE_FIELDS)[number], unknown>
>;

export type ProfileCopy<Brand> = {
  uid: string;
  profile: ProfileFields;
  institution: Brand | null;
  institutionExists: boolean | null;
  savedAt: number;
};

export const PROFILE_COPY = "profile";

export function pickProfile(
  data: Record<string, unknown> | undefined,
): ProfileFields {
  const out: ProfileFields = {};
  for (const field of PROFILE_FIELDS) {
    if (data && data[field] !== undefined) out[field] = data[field];
  }
  return out;
}

const OFFLINE_CODES = new Set(["unavailable", "deadline-exceeded"]);

/**
 * Whether a failed read means "the server couldn't be reached" rather than a real answer such as permission-denied.
 * Only then may a tab carry on from its working copy.
 */
export function isOfflineError(error: unknown, online: boolean): boolean {
  if (!online) return true;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && OFFLINE_CODES.has(code)) return true;
  const message = (error as { message?: unknown } | null)?.message;
  return (
    typeof message === "string" && /client is offline|offline/i.test(message)
  );
}

export type OfflineStart = "none" | "copy" | "blocked";

/** What a tab does when its profile can't be read because it's offline. */
export function offlineStartFrom<Brand>(
  copy: ProfileCopy<Brand> | undefined,
  uid: string,
): OfflineStart {
  return copy && copy.uid === uid && typeof copy.profile.role === "string"
    ? "copy"
    : "blocked";
}
