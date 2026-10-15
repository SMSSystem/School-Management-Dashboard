import { describe, expect, it } from 'vitest';
import {
  QA_INSTITUTION_NAMES,
  isQaInstitutionName,
  maskEmail,
  passwordProblem,
  planAdminReset,
} from '../../../scripts/resetQaAdminPasswordLogic.mjs';
import scriptRaw from '../../../scripts/reset-qa-institution-admin-password.mjs?raw';

// The QA admin password reset script: only the disposable QA institutions, only
// institution_admin accounts that have both a document and an Auth account.

const NAME = 'Brookfield Evening Institute';

describe('which institutions the script may touch', () => {
  it('accepts the two QA names exactly and nothing else', () => {
    expect(QA_INSTITUTION_NAMES).toEqual(['Brookfield Evening Institute', 'Hawthorn Institute', 'Blue Mountain Primary School']);
    expect(isQaInstitutionName(NAME)).toBe(true);
    for (const v of ['brookfield evening institute', 'Brookfield Evening Institute ', 'Example School', '', null, undefined]) {
      expect(isQaInstitutionName(v), String(v)).toBe(false);
    }
  });
});

describe('passwordProblem', () => {
  it('requires length and a mix of letters and a digit', () => {
    expect(passwordProblem('Abcdefghij12')).toBeNull();
    expect(passwordProblem('Abcdefgh1')).toMatch(/at least 12/);
    expect(passwordProblem('abcdefghijkl1')).toMatch(/upper-case/);
    expect(passwordProblem('ABCDEFGHIJKL1')).toMatch(/lower-case/);
    expect(passwordProblem('Abcdefghijkl')).toMatch(/digit/);
    expect(passwordProblem(undefined)).toMatch(/at least 12/);
  });
});

describe('planAdminReset', () => {
  const one = [{ id: 'inst1' }];

  it('refuses a name that is not a QA institution, before looking at anything else', () => {
    const plan = planAdminReset({ name: 'Example School', institutions: one, admins: [{ uid: 'a' }], authUids: new Set(['a']) });
    expect(plan.kind).toBe('refuse');
  });

  it('reports a missing, ambiguous or admin-less institution', () => {
    expect(planAdminReset({ name: NAME, institutions: [], admins: [], authUids: new Set() }).kind).toBe('no-institution');
    expect(planAdminReset({ name: NAME, institutions: [{ id: 'a' }, { id: 'b' }], admins: [], authUids: new Set() }).kind).toBe('ambiguous');
    expect(planAdminReset({ name: NAME, institutions: one, admins: [], authUids: new Set() }).kind).toBe('no-admin');
  });

  it('resets only admins with an Auth account and reports the orphaned ones', () => {
    const plan = planAdminReset({ name: NAME, institutions: one, admins: [{ uid: 'a' }, { uid: 'b' }], authUids: new Set(['a']) });
    expect(plan).toEqual({ kind: 'ready', institutionId: 'inst1', resettable: ['a'], orphaned: ['b'], recreatable: [], blocked: [] });
  });

  describe('recreating a missing Auth account', () => {
    const admin = { uid: 'b', email: 'Brookfield.Admin@demo.com' };
    const base = { name: NAME, institutions: one, admins: [admin], authUids: new Set<string>() };

    it('does nothing without the flag, even if the account could be recreated', () => {
      const plan = planAdminReset(base);
      expect(plan).toMatchObject({ orphaned: ['b'], recreatable: [], blocked: [] });
    });

    it('recreates when the email is valid and unused', () => {
      expect(planAdminReset({ ...base, recreate: true })).toMatchObject({ recreatable: ['b'], blocked: [] });
    });

    it('treats the email as its own when the Auth account with it is the same uid', () => {
      const emailOwners = new Map([['brookfield.admin@demo.com', 'b']]);
      expect(planAdminReset({ ...base, recreate: true, emailOwners })).toMatchObject({ recreatable: ['b'] });
    });

    it('blocks an email already used by another Auth account, naming that uid but not the address', () => {
      const emailOwners = new Map([['brookfield.admin@demo.com', 'other']]);
      const plan = planAdminReset({ ...base, recreate: true, emailOwners });
      expect(plan).toMatchObject({ recreatable: [] });
      expect(JSON.stringify(plan)).toContain('already used by Auth account other');
      expect(JSON.stringify(plan)).not.toContain('brookfield.admin@demo.com');
    });

    it('blocks a document with no valid email', () => {
      for (const email of [undefined, '', 'not-an-email']) {
        const plan = planAdminReset({ ...base, admins: [{ uid: 'b', email }], recreate: true });
        expect(plan, String(email)).toMatchObject({ recreatable: [], blocked: [{ uid: 'b' }] });
      }
    });

    it('never recreates an admin that already has an Auth account', () => {
      const plan = planAdminReset({ ...base, authUids: new Set(['b']), recreate: true });
      expect(plan).toMatchObject({ resettable: ['b'], orphaned: [], recreatable: [] });
    });
  });
});

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('brookfield.admin@demo.com')).toBe('b***@demo.com');
  });
});

describe('the script', () => {
  const script = scriptRaw.split('\r\n').join('\n');

  it('is a dry run unless --live, and never writes the password to a file', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script).toContain('if (!opts.live) {');
    expect(script).not.toContain('writeFileSync');
  });

  it('creates an Auth account only for planned, opted-in recreations, under the document uid', () => {
    expect(script.match(/auth\.createUser\(/g)).toHaveLength(1);
    expect(script).toContain('const recreated = plan.recreatable.includes(uid);');
    expect(script).toContain("else if (arg === '--recreate-missing-auth') opts.recreate = true;");
    expect(script).toContain('await auth.createUser({ uid, email:');
  });

  it('only touches institution_admin users of the named institution', () => {
    expect(script).toContain(".where('role', '==', 'institution_admin')");
    expect(script).toContain('planAdminReset(');
  });
});
