import { describe, expect, it } from 'vitest';
import { inactivityTimeoutMs, STAFF_INACTIVITY_MS } from '../inactivityTimeout';
import auditLog from '../../scenes/(dashboard)/admin/audit-log/index.tsx?raw';
import lessonNotesHook from '../../hooks/useLessonNotes.ts?raw';
import profileAudit from '../../components/profile/ProfileAuditSection.tsx?raw';
import profileActivity from '../../components/profile/ProfileActivitySection.tsx?raw';

// Page-level checks for the spectator role (docs/miscellaneous-specs/
// SPECTATOR_ROLE_SPEC.md, Phase 4). The source-reading checks follow the same
// approach as appRoutesSpectator.test.ts: they fail if a later edit takes a
// spectator out of a view it should have, or into one it should not.

describe('spectator and the inactivity timeout', () => {
  it('gets the short staff window, because it reads personal data', () => {
    expect(inactivityTimeoutMs('spectator')).toBe(STAFF_INACTIVITY_MS);
  });
});

describe('audit log page', () => {
  it('treats a spectator like an institution admin: its own institution only', () => {
    expect(auditLog).toContain('const isInstitutionScoped = role === "institution_admin" || role === "spectator";');
    expect(auditLog).not.toContain('isInstitutionAdmin');
  });

  it('never offers the all-institutions picker or collection-group query to the scoped roles', () => {
    // The nested per-institution path is used whenever isInstitutionScoped is true.
    expect(auditLog).toMatch(/isInstitutionScoped\s*\?\s*institutionCollection\(institutionId!, "audit_log"\)/);
  });

  it('makes no writes', () => {
    expect(/\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch)\s*\(/.test(auditLog)).toBe(false);
  });
});

describe('lesson notes hook', () => {
  it('lets a spectator read the whole collection, as an admin does', () => {
    expect(lessonNotesHook).toContain('if (hasAdminView(role)) {');
    expect(lessonNotesHook).toContain("from '@/lib/roleCapabilities'");
  });
});

describe('profile sections', () => {
  it('keeps the security events section for admins only (a spectator sees nothing)', () => {
    expect(profileAudit).toContain('if (role !== "institution_admin" && role !== "super_admin") return null;');
  });

  it('does not list the spectator among the staff who perform recordable actions', () => {
    expect(profileActivity).toMatch(/const STAFF_ROLES: Role\[\] = \["super_admin", "institution_admin", "senior_teacher", "regular_teacher"\];/);
    expect(profileActivity).not.toContain('spectator');
  });
});
