import { describe, expect, it } from 'vitest';
import { AUDIT_ENTRY_KEYS, MAX_AUDIT_DETAIL, buildAuditEntry } from '../auditEntry';
import rules from '../../../firestore.rules?raw';

const input = {
  institutionId: 'inst1',
  eventType: 'profile_edit' as const,
  detail: 'Updated phone for Jane Doe',
  targetUid: 'u1',
  targetName: 'Jane Doe',
  performedBy: 'admin1',
  performedByName: 'Admin',
};

describe('buildAuditEntry', () => {
  it('has exactly the keys firestore.rules require, including recordedAt', () => {
    const entry = buildAuditEntry(input);
    expect(Object.keys(entry).sort()).toEqual([...AUDIT_ENTRY_KEYS].sort());
    expect(entry.recordedAt).toBeDefined();
  });

  it('keeps the legacy client timestamp as an ISO string', () => {
    expect(buildAuditEntry(input).timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('passes a short detail through untouched', () => {
    expect(buildAuditEntry(input).detail).toBe(input.detail);
  });

  it('clamps a long detail to the 300 characters the rules allow', () => {
    const entry = buildAuditEntry({ ...input, detail: 'x'.repeat(500) });
    expect(entry.detail).toHaveLength(MAX_AUDIT_DETAIL);
    expect(entry.detail.endsWith('…')).toBe(true);
  });

  it('does not clamp a detail of exactly the limit', () => {
    const detail = 'y'.repeat(MAX_AUDIT_DETAIL);
    expect(buildAuditEntry({ ...input, detail }).detail).toBe(detail);
  });
});

// The helper's key list and the rules' key list are separate; they must agree.
describe('audit_log rules', () => {
  const block = rules.slice(rules.indexOf('match /institutions/{institutionId}/audit_log/{eventId}'));

  it('require the same keys the helper writes', () => {
    for (const key of AUDIT_ENTRY_KEYS) expect(block).toContain(`'${key}'`);
  });

  it('cap detail at the helper\'s limit', () => {
    expect(block).toContain(`detail.size() <= ${MAX_AUDIT_DETAIL}`);
  });
});
