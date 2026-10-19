import { describe, expect, it } from 'vitest';
import {
  generatePassword,
  isSafeInstitutionId,
  maskEmail,
  passwordProblem,
  pickSpectators,
} from '../../../scripts/rotateSpectatorLogic.mjs';
import scriptRaw from '../../../scripts/rotate-spectator-default-passwords.mjs?raw';

// The one-off script that replaces the old public spectator password on accounts that never signed
// in. It picks only spectators still on their first-sign-in flag, does nothing unless --live, and
// never writes a password to its log.

const script = scriptRaw.split('\r\n').join('\n');
const user = (over: Record<string, unknown> = {}) => ({
  uid: 'u1',
  role: 'spectator',
  mustChangePassword: true,
  institutionId: 'inst1',
  ...over,
});

describe('pickSpectators', () => {
  it('picks a spectator that has not been through the forced password change and has an Auth account', () => {
    const { picked, skipped } = pickSpectators({ users: [user()], authUids: new Set(['u1']) });
    expect(picked.map((u) => u.uid)).toEqual(['u1']);
    expect(skipped).toEqual([]);
  });

  it('leaves alone a spectator that chose its own password (flag false or missing)', () => {
    const users = [user({ uid: 'a', mustChangePassword: false }), user({ uid: 'b', mustChangePassword: undefined })];
    const { picked, skipped } = pickSpectators({ users, authUids: new Set(['a', 'b']) });
    expect(picked).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('never picks another role, even with the flag set', () => {
    const users = ['student', 'parent', 'institution_admin', 'super_admin', 'regular_teacher'].map((role, i) =>
      user({ uid: `x${i}`, role }),
    );
    const { picked } = pickSpectators({ users, authUids: new Set(users.map((u) => u.uid)) });
    expect(picked).toEqual([]);
  });

  it('skips, and says why, a spectator with no Auth account or no usable institution id', () => {
    const users = [user({ uid: 'noauth' }), user({ uid: 'badinst', institutionId: 'a/b' }), user({ uid: 'noinst', institutionId: undefined })];
    const { picked, skipped } = pickSpectators({ users, authUids: new Set(['badinst', 'noinst']) });
    expect(picked).toEqual([]);
    expect(skipped.map((s) => s.uid)).toEqual(['noauth', 'badinst', 'noinst']);
    expect(skipped[0].reason).toMatch(/no Firebase Auth account/);
    expect(skipped[1].reason).toMatch(/institutionId/);
  });
});

describe('passwords and ids', () => {
  it('generatePassword gives 16 characters with a lower-case letter, an upper-case letter and a digit, and no look-alikes', () => {
    let n = 7;
    const rnd = (max: number) => (n = (n * 31 + 11) % 100003) % max;
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword(rnd);
      expect(pw).toHaveLength(16);
      expect(passwordProblem(pw), pw).toBeNull();
      expect(pw).not.toMatch(/[lIO01]/);
    }
  });

  it('passwordProblem asks for 12 characters and a mix', () => {
    expect(passwordProblem('Abcdefghij12')).toBeNull();
    expect(passwordProblem('Abcdefgh1')).toMatch(/at least 12/);
    expect(passwordProblem('abcdefghijkl1')).toMatch(/upper-case/);
    expect(passwordProblem('ABCDEFGHIJKL1')).toMatch(/lower-case/);
    expect(passwordProblem('Abcdefghijkl')).toMatch(/digit/);
  });

  it('accepts a single institution id and nothing with a path in it', () => {
    expect(isSafeInstitutionId('aB3dE5fG7hI9jK1lM2nO')).toBe(true);
    for (const bad of ['', 'a/b', '..', 'a b', 'a'.repeat(65), undefined, null]) expect(isSafeInstitutionId(bad), String(bad)).toBe(false);
  });

  it('masks an address to its first character and domain', () => {
    expect(maskEmail('spectator@school.edu')).toBe('s***@school.edu');
    expect(maskEmail(undefined)).toBe('undefined');
  });
});

describe('the script', () => {
  it('is a dry run unless --live is passed', () => {
    expect(script).toContain("const opts = { keyPath: null, institution: null, password: null, live: false };");
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    const firstWrite = script.indexOf('auth.updateUser(');
    expect(firstWrite).toBeGreaterThan(script.indexOf('if (opts.live) {'));
  });

  it('keeps the first-sign-in flag on, so the person still chooses their own password', () => {
    expect(script).not.toContain('mustChangePassword: false');
    expect(script).toContain('revokeRefreshTokens');
  });

  it('prints the new passwords to the screen only, never into the log file', () => {
    const logWrite = script.slice(script.indexOf('writeFileSync(logPath'));
    expect(logWrite).not.toContain('password');
    expect(script.slice(script.indexOf('const entry ='), script.indexOf('if (opts.live) {'))).not.toContain('password');
    expect(script).toContain('entry.accounts.push({ uid: u.uid, email: maskEmail(u.email), institutionId: u.institutionId });');
  });
});
