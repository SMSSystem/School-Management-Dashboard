import type { Role } from "@/lib/firebase";
import { buildLoginLink } from "@/lib/loginEmail/loginLink";
import { linkRoleFor } from "@/lib/roleDefaultPasswords";
import type { InstitutionEmailSettings } from "@/lib/loginEmail/emailSettings";

// The variables the institution's one EmailJS template receives
// (INSTITUTION_LOGIN_EMAILS_SPEC.md §7.2, MVP subset). The password is never
// among them: the link carries a role code, and the login page supplies the
// role's default itself. EmailJS escapes {{double}} braces, so values are plain text.

const ROLE_LABELS = { student: "student", teacher: "teacher", spectator: "spectator" } as const;

export type LoginEmailParams = {
  to_email: string;
  to_name: string;
  portal_name: string;
  role_label: string;
  login_url: string;
  logo_url: string;
  reply_to: string;
  subject: string;
};

export function buildLoginEmailParams(input: {
  appUrl: string;
  institutionId: string;
  role: Role;
  name: string;
  email: string;
  settings: InstitutionEmailSettings;
}): LoginEmailParams {
  const code = linkRoleFor(input.role);
  if (!code) throw new Error(`Role ${input.role} is not emailed a sign-in link.`);
  const base = input.appUrl.replace(/\/+$/, "");
  return {
    to_email: input.email.trim(),
    to_name: input.name,
    portal_name: input.settings.portalName,
    role_label: ROLE_LABELS[code],
    login_url: buildLoginLink(base, input.institutionId, code),
    logo_url: `${base}/apple-touch-icon.png`,
    reply_to: input.settings.replyTo ?? "",
    subject: `Your ${input.settings.portalName} sign-in link`,
  };
}
