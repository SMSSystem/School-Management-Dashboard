import { describe, expect, it } from 'vitest';
import type { Role } from '../firebase';
import { canManage, canWrite, hasAdminView, hasStaffView } from '../roleCapabilities';

// Typed as Record<Role, ...> so adding a role to the Role union fails tsc here
// until its capabilities are decided.
const EXPECTED: Record<Role, { adminView: boolean; staffView: boolean; write: boolean; manage: boolean }> = {
  super_admin: { adminView: true, staffView: true, write: true, manage: true },
  institution_admin: { adminView: true, staffView: true, write: true, manage: true },
  spectator: { adminView: true, staffView: true, write: false, manage: false },
  senior_teacher: { adminView: false, staffView: true, write: true, manage: false },
  regular_teacher: { adminView: false, staffView: true, write: true, manage: false },
  student: { adminView: false, staffView: false, write: false, manage: false },
  parent: { adminView: false, staffView: false, write: false, manage: false },
};

const ROLES = Object.keys(EXPECTED) as Role[];

describe('roleCapabilities', () => {
  for (const role of ROLES) {
    it(`${role} matches the capability table`, () => {
      const e = EXPECTED[role];
      expect(hasAdminView(role)).toBe(e.adminView);
      expect(hasStaffView(role)).toBe(e.staffView);
      expect(canWrite(role)).toBe(e.write);
      expect(canManage(role)).toBe(e.manage);
    });
  }

  it('gives a missing role no access at all', () => {
    for (const role of [null, undefined]) {
      expect(hasAdminView(role)).toBe(false);
      expect(hasStaffView(role)).toBe(false);
      expect(canWrite(role)).toBe(false);
      expect(canManage(role)).toBe(false);
    }
  });

  it('never lets a spectator write or manage, and always lets it see what an admin sees', () => {
    expect(canWrite('spectator')).toBe(false);
    expect(canManage('spectator')).toBe(false);
    expect(hasAdminView('spectator')).toBe(true);
    expect(hasStaffView('spectator')).toBe(true);
  });

  it('gives a spectator exactly the institution admin view', () => {
    expect(hasAdminView('spectator')).toBe(hasAdminView('institution_admin'));
    expect(hasStaffView('spectator')).toBe(hasStaffView('institution_admin'));
  });

  it('keeps the sets nested: admin view within staff view, manage within write', () => {
    for (const role of ROLES) {
      if (hasAdminView(role)) expect(hasStaffView(role)).toBe(true);
      if (canManage(role)) expect(canWrite(role)).toBe(true);
    }
  });
});
