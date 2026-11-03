import { describe, expect, it } from 'vitest';
import dbRulesRaw from '../../../database.rules.json?raw';
import type { Role } from '../firebase';
import {
  INSTITUTION_BUDGET_BYTES,
  TOTAL_BUDGET_BYTES,
  TOTAL_USAGE_PATH,
  blobPath,
  budgetMessage,
  buildDeleteUpdate,
  buildPutUpdate,
  checkBudget,
  institutionUsagePath,
  isPermissionDenied,
  isValidInstitutionId,
  newBlobKey,
  policyFor,
} from '../blobStoreLogic';

// The pure parts of the large-attachment store. The rules (database.rules.json)
// are what actually enforce these limits; this keeps the client in step with them
// so a valid upload is never refused and an invalid one never sent.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = '3b1ab39c-1c4e-4f0a-9d3e-0123456789ab';

describe('budgets match database.rules.json', () => {
  const rules = (JSON.parse(dbRulesRaw) as { rules: Record<string, Record<string, Record<string, unknown>>> }).rules;
  const instCap = (rules.usage.institutions.$institutionId as { bytes: Record<string, string> }).bytes['.validate'];
  const totalCap = (rules.usage.total as unknown as { bytes: Record<string, string> }).bytes['.validate'];

  it('has the same per-school and global caps', () => {
    expect(instCap).toContain(`<= ${INSTITUTION_BUDGET_BYTES}`);
    expect(totalCap).toContain(`<= ${TOTAL_BUDGET_BYTES}`);
  });

  it('keeps the global ceiling under the 1 GB Spark limit and above one school', () => {
    expect(TOTAL_BUDGET_BYTES).toBeLessThan(1_000_000_000);
    expect(TOTAL_BUDGET_BYTES).toBeGreaterThan(INSTITUTION_BUDGET_BYTES);
  });

  it('keeps the stored bytes under 1 GB too, since the store holds base64 and the counters raw sizes', () => {
    expect((TOTAL_BUDGET_BYTES * 4) / 3).toBeLessThan(1_000_000_000);
  });
});

describe('paths', () => {
  it('uses the layout the rules define', () => {
    expect(blobPath('inst1', KEY)).toBe(`files/inst1/${KEY}`);
    expect(institutionUsagePath('inst1')).toBe('usage/institutions/inst1/bytes');
    expect(TOTAL_USAGE_PATH).toBe('usage/total/bytes');
  });
});

describe('newBlobKey', () => {
  it('is a lower-case UUID the rules accept, and different each time', () => {
    const a = newBlobKey();
    expect(UUID_RE.test(a)).toBe(true);
    expect(newBlobKey()).not.toBe(a);
  });
});

describe('isValidInstitutionId', () => {
  it('accepts Firestore-style ids and rejects characters the database forbids', () => {
    expect(isValidInstitutionId('aB3dE5fG7hI9jK1lM2nO')).toBe(true);
    for (const bad of ['', 'a/b', 'a.b', 'a$b', 'a#b', 'a[b', 'a]b', 'a b', 'x'.repeat(129)]) {
      expect(isValidInstitutionId(bad), bad).toBe(false);
    }
    expect(isValidInstitutionId('x'.repeat(128))).toBe(true);
  });
});

describe('checkBudget', () => {
  const size = 5 * 1024 * 1024;

  it('allows an upload that fits both budgets, up to the exact limit', () => {
    expect(checkBudget({ institution: 0, total: 0 }, size)).toBeNull();
    expect(checkBudget({ institution: INSTITUTION_BUDGET_BYTES - size, total: 0 }, size)).toBeNull();
  });

  it('reports the school budget first when it would overflow', () => {
    expect(checkBudget({ institution: INSTITUTION_BUDGET_BYTES - size + 1, total: 0 }, size)).toBe('institution');
    expect(
      checkBudget({ institution: INSTITUTION_BUDGET_BYTES, total: TOTAL_BUDGET_BYTES }, size),
    ).toBe('institution');
  });

  it('reports the global budget when only it would overflow', () => {
    expect(checkBudget({ institution: 0, total: TOTAL_BUDGET_BYTES - size + 1 }, size)).toBe('total');
  });

  it('has a distinct message for each', () => {
    expect(budgetMessage('institution')).toContain('school');
    expect(budgetMessage('total')).toContain('system');
    expect(budgetMessage('institution')).not.toBe(budgetMessage('total'));
  });
});

describe('buildPutUpdate', () => {
  const stamp = { '.sv': 'timestamp' };
  const base = {
    institutionId: 'inst1',
    key: KEY,
    dataUrl: 'data:application/pdf;base64,AAAA',
    mimeType: 'application/pdf',
    size: 1000,
    uploadedBy: 'uid1',
    uploadedAt: stamp,
    usage: { institution: 500, total: 9000 },
  };

  it('writes the file and BOTH counters in one multi-path update', () => {
    const u = buildPutUpdate(base);
    expect(Object.keys(u).sort()).toEqual([`files/inst1/${KEY}`, 'usage/institutions/inst1/bytes', 'usage/total/bytes'].sort());
  });

  it('raises each counter by exactly the file size (what the rules require)', () => {
    const u = buildPutUpdate(base);
    expect(u['usage/institutions/inst1/bytes']).toBe(1500);
    expect(u['usage/total/bytes']).toBe(10000);
  });

  it('stores exactly the five fields the rules allow', () => {
    const file = buildPutUpdate(base)[`files/inst1/${KEY}`] as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual(['dataUrl', 'mimeType', 'size', 'uploadedAt', 'uploadedBy']);
    expect(file.uploadedAt).toBe(stamp);
    expect(file.uploadedBy).toBe('uid1');
    expect(file.size).toBe(1000);
  });

  it('refuses a bad institution id or size', () => {
    expect(() => buildPutUpdate({ ...base, institutionId: 'a/b' })).toThrow();
    expect(() => buildPutUpdate({ ...base, size: 0 })).toThrow();
    expect(() => buildPutUpdate({ ...base, size: Number.NaN })).toThrow();
  });
});

describe('buildDeleteUpdate', () => {
  it('removes the file and lowers both counters by its size', () => {
    const u = buildDeleteUpdate({ institutionId: 'inst1', key: KEY, size: 1000, usage: { institution: 1500, total: 10000 } });
    expect(u[`files/inst1/${KEY}`]).toBeNull();
    expect(u['usage/institutions/inst1/bytes']).toBe(500);
    expect(u['usage/total/bytes']).toBe(9000);
  });

  it('never takes a counter below zero (the rules floor it the same way)', () => {
    const u = buildDeleteUpdate({ institutionId: 'inst1', key: KEY, size: 1000, usage: { institution: 200, total: 0 } });
    expect(u['usage/institutions/inst1/bytes']).toBe(0);
    expect(u['usage/total/bytes']).toBe(0);
  });
});

describe('isPermissionDenied', () => {
  it('recognises the SDK error by code or message', () => {
    expect(isPermissionDenied({ code: 'PERMISSION_DENIED' })).toBe(true);
    expect(isPermissionDenied(new Error('PERMISSION_DENIED: Permission denied'))).toBe(true);
    expect(isPermissionDenied(new Error('network'))).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied('PERMISSION_DENIED')).toBe(false);
  });
});

describe('policyFor', () => {
  const EXPECTED_WITH_URL: Record<Role, string> = {
    super_admin: 'none',
    institution_admin: 'enabled',
    spectator: 'none',
    senior_teacher: 'enabled',
    regular_teacher: 'enabled',
    student: 'none',
    parent: 'none',
  };

  for (const role of Object.keys(EXPECTED_WITH_URL) as Role[]) {
    it(`${role}: ${EXPECTED_WITH_URL[role]} with a database URL`, () => {
      expect(policyFor(role, true)).toBe(EXPECTED_WITH_URL[role]);
    });
  }

  it('is a clear error state, not a silent downgrade, without a database URL', () => {
    expect(policyFor('regular_teacher', false)).toBe('unconfigured');
    expect(policyFor('institution_admin', false)).toBe('unconfigured');
    expect(policyFor('student', false)).toBe('none');
    expect(policyFor(null, true)).toBe('none');
  });
});
