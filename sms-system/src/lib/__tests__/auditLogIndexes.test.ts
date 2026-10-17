import { describe, expect, it } from 'vitest';
import indexes from '../../../firestore.indexes.json';
import auditPageRaw from '../../scenes/(dashboard)/admin/audit-log/index.tsx?raw';

// The super admin's Audit Log lists every institution's log with collectionGroup("audit_log") and
// orderBy("timestamp", "desc") alone. Firestore creates single-field indexes by itself only for the
// collection scope; a collection-group one must be declared. The file declared composite
// collection-group indexes (eventType, institutionId and performedBy with timestamp) but not this
// one, so the page failed with "The query requires a COLLECTION_GROUP_DESC index for collection
// audit_log and field timestamp". Found on 2026-10-17 by a sweep of the built app as the QA super
// admin, once failed queries were reported (lib/reportError.ts). Deploy it with
// `npm run firebase:deploy:indexes`; an index takes a few minutes to build.

type Override = { collectionGroup: string; fieldPath: string; indexes: { order?: string; arrayConfig?: string; queryScope: string }[] };
const overrides = indexes.fieldOverrides as Override[];
const norm = (s: string) => s.split('\r\n').join('\n');

describe('the audit_log timestamp index', () => {
  const override = overrides.find((o) => o.collectionGroup === 'audit_log' && o.fieldPath === 'timestamp');

  it('is declared at collection-group scope, newest first', () => {
    expect(override, 'add a fieldOverrides entry for audit_log.timestamp').toBeDefined();
    expect(override!.indexes).toContainEqual({ order: 'DESCENDING', queryScope: 'COLLECTION_GROUP' });
  });

  it('keeps the collection-scope indexes the override would otherwise replace', () => {
    expect(override!.indexes).toContainEqual({ order: 'ASCENDING', queryScope: 'COLLECTION' });
    expect(override!.indexes).toContainEqual({ order: 'DESCENDING', queryScope: 'COLLECTION' });
  });

  it('is what the page needs: an unfiltered collection-group read ordered by timestamp', () => {
    const page = norm(auditPageRaw);
    expect(page).toContain('collectionGroup(db, "audit_log")');
    expect(page).toContain('orderBy("timestamp", "desc"),');
  });

  it('leaves the existing TTL override on attempts.deleteAt alone', () => {
    expect(overrides.find((o) => o.collectionGroup === 'attempts' && o.fieldPath === 'deleteAt')).toBeDefined();
  });
});
