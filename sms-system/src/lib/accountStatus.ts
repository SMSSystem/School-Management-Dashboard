// Account deactivation. An admin sets users/{uid}.status to 'inactive';
// firestore.rules then stops matching that account for every role and
// institution check (see accountActive() in firestore.rules), and the app signs
// it out with a clear message instead of failing every page with
// "Missing or insufficient permissions".
//
// Mirrors the rule exactly: ONLY the literal 'inactive' deactivates. A missing
// status (older documents) or any other value counts as active, so this can't
// lock out an account that was never given one.

import type { UserStatus } from './firebase';

export const INACTIVE_ACCOUNT_MESSAGE =
  'This account is inactive. Contact your administrator to have it reactivated.';

export function isAccountInactive(status: unknown): boolean {
  return status === 'inactive';
}

export function statusLabel(status: unknown): string {
  return isAccountInactive(status) ? 'Inactive' : 'Active';
}

// What an admin's deactivate/reactivate button should write next.
export function nextStatus(status: unknown): UserStatus {
  return isAccountInactive(status) ? 'active' : 'inactive';
}

// The audit_log entry for that change (see AuditEventType in firebase.ts).
export function statusAuditEvent(status: UserStatus): 'account_suspended' | 'account_reactivated' {
  return status === 'inactive' ? 'account_suspended' : 'account_reactivated';
}
