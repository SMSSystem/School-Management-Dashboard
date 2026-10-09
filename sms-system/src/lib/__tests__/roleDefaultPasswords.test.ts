import { describe, expect, it } from 'vitest';
import createUserForm from '../../components/forms/AdminCreateUserForm.tsx?raw';
import importPage from '../../scenes/(dashboard)/import/index.tsx?raw';
import resetScript from '../../../scripts/reset-role-default-passwords.mjs?raw';

// The default "temporary password" per role lives in three places that nothing
// else keeps in step: the Create Account form, the student import page and the
// one-off reset script (whose own header says to verify them by hand). A
// well-known password on a privileged role is the risk, so this pins them
// together and pins the roles that must NOT have one: institution_admin,
// super_admin and the spectator (which reads what an institution_admin reads).
// Reads the sources as text, like the other spectator guards.

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

const form = defaultsIn(createUserForm);
const script = defaultsIn(resetScript);

describe('role default passwords', () => {
  it('are the same in the Create Account form and the reset script', () => {
    expect(script).toEqual(form);
  });

  it('cover exactly the four roles that get one', () => {
    expect(Object.keys(form).sort()).toEqual(['parent', 'regular_teacher', 'senior_teacher', 'student']);
  });

  it('give no well-known password to institution_admin, super_admin or the spectator', () => {
    for (const role of ['institution_admin', 'super_admin', 'spectator']) {
      expect(form, role).not.toHaveProperty(role);
      expect(script, role).not.toHaveProperty(role);
    }
  });

  it('match the shared student import password', () => {
    const m = importPage.match(/SHARED_STUDENT_IMPORT_PASSWORD\s*=\s*["']([^"']+)["']/);
    expect(m?.[1]).toBe(form.student);
  });

  it('the reset script only touches roles that have a default (an allow-list)', () => {
    expect(resetScript).toContain('const ELIGIBLE_ROLES = Object.keys(ROLE_DEFAULT_PASSWORDS);');
    expect(resetScript).toContain('institution_admin/super_admin/spectator');
  });
});
