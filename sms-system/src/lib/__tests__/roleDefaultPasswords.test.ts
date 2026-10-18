import { describe, expect, it } from 'vitest';
import {
  ROLE_DEFAULT_PASSWORDS,
  LOGIN_LINK_ROLES,
  defaultPasswordForLinkRole,
  isLoginLinkRole,
  linkRoleFor,
} from '../roleDefaultPasswords';
import { createUserFormSource as createUserForm } from './createUserFormSource';
import { importSource as importPage } from './importSource';
import resetScript from '../../../scripts/reset-role-default-passwords.mjs?raw';

// The default "temporary password" per role has one source
// (src/lib/roleDefaultPasswords.ts) used by the Create Account form, the student
// import page and the login-link page, plus a copy in the one-off reset script,
// which cannot import TypeScript. A well-known password on a privileged role is
// the risk, so this pins the copy to the source and pins the roles that must NOT
// have one: institution_admin and super_admin. The spectator HAS one since the
// login-email feature (INSTITUTION_LOGIN_EMAILS_SPEC.md), a deliberate reversal
// of the earlier rule. Reads the sources as text, like the other guards.

// The `key: 'value'` pairs of the ROLE_DEFAULT_PASSWORDS object literal in a source.
function defaultsIn(src: string): Record<string, string> {
  const start = src.indexOf('const ROLE_DEFAULT_PASSWORDS');
  expect(start, 'const ROLE_DEFAULT_PASSWORDS not found').toBeGreaterThan(-1);
  const open = src.indexOf('{', src.indexOf('=', start));
  const body = src.slice(open + 1, src.indexOf('}', open));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(\w+)\s*:\s*["']([^"']+)["']/g)) out[m[1]] = m[2];
  return out;
}

const script = defaultsIn(resetScript);

describe('role default passwords', () => {
  it('are the same in the shared module and the reset script', () => {
    expect(script).toEqual(ROLE_DEFAULT_PASSWORDS);
  });

  it('cover exactly the five roles that get one', () => {
    expect(Object.keys(ROLE_DEFAULT_PASSWORDS).sort()).toEqual([
      'parent',
      'regular_teacher',
      'senior_teacher',
      'spectator',
      'student',
    ]);
  });

  it('give no well-known password to institution_admin or super_admin', () => {
    for (const role of ['institution_admin', 'super_admin']) {
      expect(ROLE_DEFAULT_PASSWORDS, role).not.toHaveProperty(role);
      expect(script, role).not.toHaveProperty(role);
    }
  });

  it('every default passes the password rules the Create Account form enforces', () => {
    for (const [role, pw] of Object.entries(ROLE_DEFAULT_PASSWORDS)) {
      expect(pw!.length, role).toBeGreaterThanOrEqual(8);
      expect(pw, role).toMatch(/[a-z]/);
      expect(pw, role).toMatch(/[A-Z]/);
      expect(pw, role).toMatch(/[0-9]/);
    }
  });

  it('the form and the import page take them from the shared module, not their own literals', () => {
    expect(createUserForm).toContain('from "@/lib/roleDefaultPasswords"');
    expect(createUserForm).not.toContain('const ROLE_DEFAULT_PASSWORDS');
    expect(importPage).toContain('from "@/lib/roleDefaultPasswords"');
    expect(importPage).toContain('SHARED_STUDENT_IMPORT_PASSWORD = ROLE_DEFAULT_PASSWORDS.student');
  });

  it('the reset script only touches roles that have a default (an allow-list)', () => {
    expect(resetScript).toContain('const ELIGIBLE_ROLES = Object.keys(ROLE_DEFAULT_PASSWORDS);');
    expect(resetScript).toContain('institution_admin/super_admin ');
  });
});

describe('the reset script options', () => {
  it('has a bulk-only --role filter limited to the roles that have a default', () => {
    expect(resetScript).toContain("arg.startsWith('--role=')");
    expect(resetScript).toContain("opts.role && !opts.institution");
    expect(resetScript).toContain('!ELIGIBLE_ROLES.includes(opts.role)');
    expect(resetScript).toContain("const roles = role ? [role] : ELIGIBLE_ROLES;");
    expect(resetScript).toContain(".where('role', 'in', roles)");
  });

  it('clears the email cooldown fields with the reset, only on a live run', () => {
    const live = resetScript.slice(resetScript.indexOf('if (opts.dryRun)'));
    expect(live.indexOf('credentialsEmailedAt: FieldValue.delete()')).toBeGreaterThan(live.indexOf('return \'wouldReset\''));
    expect(resetScript).toContain('credentialsEmailCount: FieldValue.delete()');
  });
});

describe('login link roles', () => {
  it('map each code to account roles that all have a default', () => {
    for (const [code, roles] of Object.entries(LOGIN_LINK_ROLES)) {
      for (const role of roles) expect(ROLE_DEFAULT_PASSWORDS, `${code}/${role}`).toHaveProperty(role);
    }
  });

  it('do not include parent, institution_admin or super_admin', () => {
    const all = Object.values(LOGIN_LINK_ROLES).flat() as string[];
    for (const role of ['parent', 'institution_admin', 'super_admin']) expect(all).not.toContain(role);
  });

  it('recognise only student, teacher and spectator', () => {
    expect(['student', 'teacher', 'spectator'].every(isLoginLinkRole)).toBe(true);
    for (const bad of ['parent', 'admin', '', 'toString', '__proto__', undefined]) {
      expect(isLoginLinkRole(bad), String(bad)).toBe(false);
    }
  });

  it('look up the right default for a code', () => {
    expect(defaultPasswordForLinkRole('student')).toBe(ROLE_DEFAULT_PASSWORDS.student);
    expect(defaultPasswordForLinkRole('teacher')).toBe(ROLE_DEFAULT_PASSWORDS.regular_teacher);
    expect(defaultPasswordForLinkRole('teacher')).toBe(ROLE_DEFAULT_PASSWORDS.senior_teacher);
    expect(defaultPasswordForLinkRole('spectator')).toBe(ROLE_DEFAULT_PASSWORDS.spectator);
  });

  it('map an account role back to its code, or null for roles that are not emailed', () => {
    expect(linkRoleFor('student')).toBe('student');
    expect(linkRoleFor('regular_teacher')).toBe('teacher');
    expect(linkRoleFor('senior_teacher')).toBe('teacher');
    expect(linkRoleFor('spectator')).toBe('spectator');
    for (const role of ['parent', 'institution_admin', 'super_admin'] as const) {
      expect(linkRoleFor(role), role).toBeNull();
    }
  });
});
