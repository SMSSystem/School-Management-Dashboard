import { describe, expect, it } from 'vitest';
import rules from '../../../firestore.rules?raw';
import indexes from '../../../firestore.indexes.json';
import { ACADEMIC_EVENT_TYPES, AUDIT_EVENT_LABELS, SECURITY_EVENT_TYPES } from '../auditEvents';

// The event types live in two lists that nothing else connects: the AuditEventType
// union (src/lib/firebase.ts, mirrored by AUDIT_EVENT_LABELS, which tsc keeps
// complete) and the allow-lists in firestore.rules. A type added to one and not
// the other fails in production with permission-denied, so CI checks them here.

const start = rules.indexOf('match /institutions/{institutionId}/audit_log/{eventId}');
const block = rules.slice(start, rules.indexOf('allow update, delete: if false;', start));

// Every `eventType in [ ... ]` list in the audit_log block, in order.
const lists = [...block.matchAll(/eventType in \[([^\]]*)\]/g)].map((m) =>
  [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]),
);

const TEACHER_TYPES = ['attendance_edit', 'results_edit', 'comment_edit', 'lesson_note_edit'];
const allTypes = Object.keys(AUDIT_EVENT_LABELS);

describe('audit_log rules event types', () => {
  it('has an admin list and a teacher list', () => {
    expect(lists).toHaveLength(2);
  });

  it('lets admins write exactly the types the app defines', () => {
    expect([...lists[0]].sort()).toEqual([...allTypes].sort());
  });

  it('lets teachers write only the four teacher events', () => {
    expect([...lists[1]].sort()).toEqual([...TEACHER_TYPES].sort());
  });

  it('keeps the teacher events out of the security category', () => {
    for (const t of TEACHER_TYPES) expect(SECURITY_EVENT_TYPES).not.toContain(t);
    for (const t of TEACHER_TYPES) expect(ACADEMIC_EVENT_TYPES).toContain(t);
  });

  it('scopes a teacher to their own entries on read', () => {
    const read = block.slice(block.indexOf('allow read'), block.indexOf('allow create'));
    expect(read).toContain('isTeacher()');
    expect(read).toContain('resource.data.performedBy == request.auth.uid');
  });

  it('applies the shared checks to every role (outside the role alternatives)', () => {
    expect(block).toMatch(/allow create: if validAuditEntry\(institutionId\)\s*&&/);
    const fn = rules.slice(rules.indexOf('function validAuditEntry'), start);
    expect(fn).toContain('recordedAt == request.time');
    expect(fn).toContain('performedBy == request.auth.uid');
    expect(fn).toContain('detail.size() <= 300');
  });
});

type IndexDef = { collectionGroup: string; queryScope: string; fields: { fieldPath: string; order?: string }[] };

describe('audit_log indexes', () => {
  const auditIndexes = (indexes.indexes as IndexDef[]).filter((i) => i.collectionGroup === 'audit_log');
  const has = (scope: string, first: string) =>
    auditIndexes.some(
      (i) => i.queryScope === scope && i.fields[0].fieldPath === first && i.fields[1]?.fieldPath === 'timestamp',
    );

  it('serves "actions I performed" for a staff member (collection) and a super_admin (collection group)', () => {
    expect(has('COLLECTION', 'performedBy')).toBe(true);
    expect(has('COLLECTION_GROUP', 'performedBy')).toBe(true);
  });

  it('serves the category filter within one institution and across all of them', () => {
    expect(has('COLLECTION', 'eventType')).toBe(true);
    expect(has('COLLECTION_GROUP', 'eventType')).toBe(true);
  });
});
