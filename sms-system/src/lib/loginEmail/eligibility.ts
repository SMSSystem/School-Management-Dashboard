import type { Role } from "@/lib/firebase";
import { linkRoleFor } from "@/lib/roleDefaultPasswords";

// Who a first-login email may be sent to (INSTITUTION_LOGIN_EMAILS_SPEC.md §5.1,
// MVP subset). Pure, so the button and the tests share one rule set. It returns
// the FIRST reason that blocks a send, in this order, or null when it is allowed.

export const EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const EMAIL_LIFETIME_CAP = 12;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailTarget = {
  role?: Role;
  status?: "active" | "inactive";
  mustChangePassword?: boolean;
  email?: string | null;
  /** When the last first-login email was sent (ms since the epoch), if ever. */
  emailedAtMs?: number | null;
  /** Lifetime count of first-login emails sent to this account. */
  emailCount?: number | null;
};

export function loginEmailBlockReason(target: EmailTarget, nowMs: number): string | null {
  if (!target.role || linkRoleFor(target.role) === null) {
    return "This role is not emailed a sign-in link.";
  }
  if (target.status === "inactive") return "This account is deactivated.";
  if (target.mustChangePassword === undefined) {
    return "This account has no first-sign-in record. Share the password by hand.";
  }
  if (target.mustChangePassword !== true) {
    return "This person has already set their own password.";
  }
  const email = (target.email ?? "").trim();
  if (!email || !EMAIL_RE.test(email)) return "This account has no usable email address.";
  if ((target.emailCount ?? 0) >= EMAIL_LIFETIME_CAP) {
    return `This account has already been emailed ${EMAIL_LIFETIME_CAP} times.`;
  }
  if (target.emailedAtMs != null && nowMs - target.emailedAtMs < EMAIL_COOLDOWN_MS) {
    return "An email was sent to this account in the last 24 hours.";
  }
  return null;
}
