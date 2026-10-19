import type { Role } from "@/lib/firebase";

// The well-known "temporary password" per role. Every account created with one
// also gets mustChangePassword: true, so it only lives until the first sign-in.
// These literals ship in the client bundle: they are a starting point, not a
// secret (see SPREADSHEET_IMPORT_STUDENTS_SPEC.md "Security Considerations").
//
// institution_admin, super_admin and spectator are deliberately absent: they
// start from a password the creating administrator chooses. A spectator reads
// everything an institution_admin reads, so a password that is public in the
// bundle would make an account that has not signed in yet readable by anyone who
// knows its address. (From 2026-10-09 to 2026-10-19 the spectator had a default
// here, for the emailed sign-in link; that was reversed.)
//
// scripts/reset-role-default-passwords.mjs keeps its own copy;
// roleDefaultPasswords.test.ts fails if the two differ.
export const ROLE_DEFAULT_PASSWORDS: Partial<Record<Role, string>> = {
  student: "Student01234567890",
  parent: "Parent0123456789",
  regular_teacher: "Teacher0123456789",
  senior_teacher: "Teacher0123456789",
};

/** The roles an emailed sign-in link may name, and the account roles each one covers. */
export const LOGIN_LINK_ROLES = {
  student: ["student"],
  teacher: ["senior_teacher", "regular_teacher"],
} as const satisfies Record<string, readonly Role[]>;

export type LoginLinkRole = keyof typeof LOGIN_LINK_ROLES;

export function isLoginLinkRole(value: string | undefined): value is LoginLinkRole {
  return value !== undefined && Object.prototype.hasOwnProperty.call(LOGIN_LINK_ROLES, value);
}

/** The default password a link's role code stands for. */
export function defaultPasswordForLinkRole(code: LoginLinkRole): string {
  return ROLE_DEFAULT_PASSWORDS[LOGIN_LINK_ROLES[code][0]] as string;
}

/** The link role code for an account role, or null when that role is not emailed. */
export function linkRoleFor(role: Role): LoginLinkRole | null {
  for (const code of Object.keys(LOGIN_LINK_ROLES) as LoginLinkRole[]) {
    if ((LOGIN_LINK_ROLES[code] as readonly Role[]).includes(role)) return code;
  }
  return null;
}
