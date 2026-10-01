import { describe, it, expect } from 'vitest';
import { isAccountInactive, nextStatus, statusAuditEvent, statusLabel } from '../accountStatus';

describe('isAccountInactive', () => {
  it("is true only for the literal 'inactive'", () => {
    expect(isAccountInactive('inactive')).toBe(true);
  });

  it('treats a missing or unknown status as active, matching firestore.rules', () => {
    for (const s of ['active', undefined, null, '', 'suspended', 'INACTIVE', 0, false]) {
      expect(isAccountInactive(s)).toBe(false);
    }
  });
});

describe('statusLabel', () => {
  it('labels inactive and everything else', () => {
    expect(statusLabel('inactive')).toBe('Inactive');
    expect(statusLabel('active')).toBe('Active');
    expect(statusLabel(undefined)).toBe('Active');
  });
});

describe('nextStatus', () => {
  it('toggles between active and inactive', () => {
    expect(nextStatus('active')).toBe('inactive');
    expect(nextStatus('inactive')).toBe('active');
  });

  it('deactivates an account that has no status yet', () => {
    expect(nextStatus(undefined)).toBe('inactive');
  });
});

describe('statusAuditEvent', () => {
  it('maps the new status to the audit event type', () => {
    expect(statusAuditEvent('inactive')).toBe('account_suspended');
    expect(statusAuditEvent('active')).toBe('account_reactivated');
  });
});
