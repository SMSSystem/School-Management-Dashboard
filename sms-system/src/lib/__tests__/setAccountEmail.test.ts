import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ROLES,
  maskEmail,
  normalizeEmail,
  planEmailChange,
} from '../../../scripts/setAccountEmailLogic.mjs';
import scriptRaw from '../../../scripts/set-account-email.mjs?raw';

// scripts/set-account-email.mjs sets one account's sign-in address on both the Firebase
// Auth user and the users document, and clears the first-login email cooldown (the Edit
// Student / Edit Parent forms change only the document). The decisions are pure and
// tested directly; the script is checked as source text, like the other owner scripts.

const script = scriptRaw.split('\r\n').join('\n');

describe('normalizeEmail', () => {
  it('trims and lower-cases a valid address', () => {
    expect(normalizeEmail('  Ann.Lee@Example.COM ')).toBe('ann.lee@example.com');
  });

  it('refuses anything that is not a plausible address', () => {
    for (const bad of ['', '   ', 'no-at', 'a@b', 'a b@c.com', '@x.com', 'a@.com ', null, undefined, 5, {}]) {
      expect(normalizeEmail(bad as never), String(bad)).toBeNull();
    }
  });

  it('refuses an address over 254 characters', () => {
    expect(normalizeEmail(`${'a'.repeat(250)}@x.com`)).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(240)}@x.com`)).not.toBeNull();
  });
});

describe('maskEmail', () => {
  it('keeps the first character and the domain only', () => {
    expect(maskEmail('helen@gmail.com')).toBe('h***@gmail.com');
    expect(maskEmail('helen@gmail.com')).not.toContain('elen');
  });

  it('is safe for a missing or odd value', () => {
    expect(maskEmail(undefined)).toBe('undefined');
    expect(maskEmail('no-at-sign')).toBe('no-at-sign');
  });
});

describe('planEmailChange', () => {
  const base = { role: 'student', docEmail: 'new@x.com', authEmail: 'old@x.com', newEmail: 'new@x.com' };

  it('changes only Auth when the document already has the new address (the edit-form case)', () => {
    expect(planEmailChange(base)).toEqual({ action: 'change', email: 'new@x.com', authChange: true, docChange: false, clearCooldown: true });
  });

  it('changes only the document when Auth already has it', () => {
    expect(planEmailChange({ ...base, docEmail: 'old@x.com', authEmail: 'new@x.com' })).toMatchObject({
      authChange: false,
      docChange: true,
      clearCooldown: true,
    });
  });

  it('changes both when neither has it, or a side has no address', () => {
    expect(planEmailChange({ ...base, docEmail: 'a@x.com', authEmail: 'b@x.com' })).toMatchObject({ authChange: true, docChange: true });
    expect(planEmailChange({ ...base, docEmail: undefined, authEmail: null })).toMatchObject({ authChange: true, docChange: true });
  });

  it('does nothing, and leaves the cooldown, when both already hold it (case and spacing ignored)', () => {
    expect(planEmailChange({ ...base, docEmail: ' NEW@x.com', authEmail: 'New@X.com' })).toEqual({ action: 'nothing', email: 'new@x.com' });
  });

  it('stores the new address lower-cased', () => {
    expect(planEmailChange({ ...base, newEmail: ' New@X.COM ' })).toMatchObject({ email: 'new@x.com' });
  });

  it('is blocked for an invalid new address', () => {
    expect(planEmailChange({ ...base, newEmail: 'nope' })).toMatchObject({ action: 'blocked' });
    expect(planEmailChange({ ...base, newEmail: undefined })).toMatchObject({ action: 'blocked' });
  });

  it('is blocked for admin roles and any unknown role, allowed for the roles with a default password', () => {
    for (const role of ['institution_admin', 'super_admin', 'toString', '', undefined]) {
      expect(planEmailChange({ ...base, role: role as never }), String(role)).toMatchObject({ action: 'blocked' });
    }
    for (const role of ALLOWED_ROLES) expect(planEmailChange({ ...base, role }).action).toBe('change');
    expect(ALLOWED_ROLES).toEqual(['student', 'parent', 'regular_teacher', 'senior_teacher', 'spectator']);
  });
});

describe('the script', () => {
  it('is a dry run unless --live is given, and writes only behind that flag', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script).toMatch(/const opts = \{[^}]*\blive: false\b/);
    expect(script.match(/opts\.live = true/g)).toHaveLength(1);
    const live = script.indexOf('if (opts.live) {\n    if (plan.authChange) {');
    expect(live).toBeGreaterThan(-1);
    expect(script.indexOf('auth.updateUser(')).toBeGreaterThan(live);
    expect(script.indexOf('userRef.update(')).toBeGreaterThan(live);
  });

  it('updates Firebase Auth before the users document, and records a partial result if the second fails', () => {
    expect(script.indexOf('auth.updateUser(')).toBeLessThan(script.indexOf('userRef.update('));
    expect(script).toContain("entry.outcome = 'partial';");
    expect(script).toContain('Run the same command again.');
  });

  it('sets the email, marks it unverified, and deletes the cooldown fields in the same document write', () => {
    expect(script).toContain('{ email: plan.email, emailVerified: false }');
    const write = script.slice(script.indexOf('userRef.update({'), script.indexOf('userRef.update({') + 200);
    expect(write).toContain('credentialsEmailedAt: FieldValue.delete()');
    expect(write).toContain('credentialsEmailCount: FieldValue.delete()');
    expect(write).toContain('email: plan.email');
  });

  it('never changes the password, the sessions or updatedAt', () => {
    expect(script).not.toMatch(/password:/);
    expect(script).not.toContain('revokeRefreshTokens');
    expect(script).not.toMatch(/updatedAt\s*:/);
  });

  it('refuses a blocked plan and an address another account already uses, before any write', () => {
    expect(script.indexOf("if (plan.action === 'blocked')")).toBeLessThan(script.indexOf('auth.updateUser('));
    expect(script).toContain('if (other.uid !== opts.uid) {');
    expect(script).toContain("if (err.code !== 'auth/user-not-found') throw err;");
    expect(script.indexOf('auth.getUserByEmail(')).toBeLessThan(script.indexOf('auth.updateUser('));
  });

  it('needs exactly one of --email and --use-document-email, and a plain uid', () => {
    expect(script).toContain("(!opts.email && !opts.useDocumentEmail) || (opts.email && opts.useDocumentEmail)");
    expect(script).toContain('/^[A-Za-z0-9]{10,64}$/.test(opts.uid)');
    expect(script).toContain('newEmail: opts.useDocumentEmail ? user.email : opts.email,');
  });

  it('prints addresses masked only', () => {
    const printed = script.split('\n').filter((l) => l.includes('console.') && /email/i.test(l));
    for (const line of printed) {
      if (/\$\{(authUser\.email|user\.email|plan\.email|opts\.email)[^}]*\}/.test(line)) {
        expect(line, line).toMatch(/maskEmail\(|\.length/);
      }
    }
  });
});
