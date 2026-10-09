import { describe, expect, it } from 'vitest';
import rules from '../../../firestore.rules?raw';
import statusToggle from '../../components/AccountStatusToggle.tsx?raw';
import sessionReset from '../../components/SessionResetButton.tsx?raw';
import { isAccountInactive, nextStatus, statusAuditEvent } from '../accountStatus';

// Phase 5 item 3 (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md): deactivating a
// spectator and clearing its sign-in session must work through the EXISTING users
// update rule, with no spectator-specific rule. There is no rules emulator here, so
// this reads the rules and the two components as text and pins every fact the
// flow depends on. What it cannot prove is a real write against deployed rules.

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();

const usersBlock = (() => {
  const a = rules.indexOf('match /users/{uid} {');
  return normalise(rules.slice(a, rules.indexOf('match /users/{uid}/photo/{photoId}', a)));
})();

const auditBlock = (() => {
  const a = rules.indexOf('match /institutions/{institutionId}/audit_log/{eventId}');
  return normalise(rules.slice(a, rules.indexOf('allow update, delete: if false;', a)));
})();

describe('the users update rule covers a spectator target', () => {
  it('lets an admin of the same institution update a non-admin account without changing its role or institution', () => {
    expect(usersBlock).toContain(
      'isAdminOrAbove() && sameInstitution(resource.data.institutionId) && institutionNotChanged() && roleNotChanged() && (isSuperAdmin() || resource.data.role != \'institution_admin\')',
    );
  });

  it('excludes only institution_admin targets, so a spectator is covered with no clause of its own', () => {
    expect(usersBlock).not.toContain("resource.data.role != 'spectator'");
    // the only mention of the spectator in the users block is the create allow-list
    const mentions = usersBlock.match(/spectator/g) ?? [];
    expect(mentions.length).toBe(2); // the comment about it and the create allow-list entry
    expect(usersBlock).toContain("'parent', 'spectator']");
  });

  it('lets an institution admin delete only a student or a teacher, and never themself', () => {
    // the super admin keeps deleting any user; an institution admin gets one narrow clause
    const from = usersBlock.indexOf('allow delete:');
    const rule = usersBlock.slice(from, usersBlock.indexOf(';', from));
    expect(rule).toContain('isSuperAdmin()');
    expect(rule).toContain('isAdmin() && !isOwner(uid)');
    expect(rule).toContain('sameInstitution(resource.data.institutionId)');
    expect(rule).toContain("resource.data.role in ['student', 'regular_teacher', 'senior_teacher']");
    expect(rule).not.toMatch(/institution_admin|parent|spectator/);
  });

  it('stops an inactive spectator matching any role, so deactivating it cuts its access', () => {
    expect(normalise(rules)).toContain("return me().get('status', 'active') != 'inactive';");
    expect(normalise(rules)).toContain("return accountActive() ? me().role : 'inactive';");
  });
});

describe('the audit entries the two actions write are allowed to an admin', () => {
  // The create rule's admin alternative: from "allow create" up to the teacher one.
  const create = auditBlock.slice(auditBlock.indexOf('allow create:'));
  const adminList = create.slice(0, create.indexOf('|| (isTeacher()'));

  it.each(['account_suspended', 'account_reactivated', 'session_reset'])('%s', (type) => {
    expect(adminList).toContain(`'${type}'`);
  });

  it('writes only the entry types the toggle and the reset button use', () => {
    expect(statusAuditEvent('inactive')).toBe('account_suspended');
    expect(statusAuditEvent('active')).toBe('account_reactivated');
    expect(sessionReset).toContain('eventType: "session_reset"');
  });
});

describe('AccountStatusToggle and SessionResetButton on a spectator', () => {
  it('only an admin sees either button, never on their own account', () => {
    for (const src of [statusToggle, sessionReset]) {
      expect(src).toContain('(role !== "institution_admin" && role !== "super_admin") || !user || user.uid === uid');
    }
  });

  it('the toggle changes only status on the target, and its entry goes in the same batch', () => {
    expect(statusToggle).toContain('batch.update(doc(db, "users", uid), { status: next });');
    expect(statusToggle).toContain('eventType: statusAuditEvent(next)');
    expect(statusToggle).toMatch(/await batch\.commit\(\);/);
  });

  it('the reset changes only sessionResetAt on the target, and its entry goes in the same batch', () => {
    expect(sessionReset).toContain('batch.update(doc(db, "users", uid), { sessionResetAt: serverTimestamp() });');
    expect(sessionReset).toMatch(/await batch\.commit\(\);/);
  });

  it('both file the audit entry under the TARGET account\'s institution', () => {
    for (const src of [statusToggle, sessionReset]) {
      expect(src).toContain('institutionCollection(institutionId, "audit_log")');
      expect(src).toContain('institutionId?: string;');
    }
  });

  it('deactivating then reactivating round-trips the status', () => {
    expect(isAccountInactive('inactive')).toBe(true);
    expect(nextStatus('active')).toBe('inactive');
    expect(nextStatus('inactive')).toBe('active');
    expect(nextStatus(undefined)).toBe('inactive');
  });
});
