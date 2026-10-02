import { serverTimestamp } from 'firebase/firestore';
import type { AuditEventType } from './firebase';

// The pure half of the audit helper (lib/auditLog.ts re-exports it). Kept apart
// from the code that touches Firestore paths so it can be unit-tested without
// initialising the Firebase app.

export type AuditEventInput = {
  institutionId: string;
  eventType: AuditEventType;
  detail: string;
  // A person's uid, or a class id for a class-scoped action (a register or a
  // gradebook has no single person as its target). The rules require the key.
  targetUid: string;
  targetName: string;
  performedBy: string;
  performedByName: string;
};

// firestore.rules: detail.size() <= 300
export const MAX_AUDIT_DETAIL = 300;

// The keys firestore.rules require, exactly (hasOnly + hasAll).
export const AUDIT_ENTRY_KEYS = [
  'eventType',
  'detail',
  'targetUid',
  'targetName',
  'performedBy',
  'performedByName',
  'timestamp',
  'institutionId',
  'recordedAt',
] as const;

// The document exactly as firestore.rules require it. Pass it to batch.set()
// (with doc(institutionCollection(id, 'audit_log'))) or to addDoc().
export function buildAuditEntry(p: AuditEventInput) {
  return {
    eventType: p.eventType,
    detail:
      p.detail.length > MAX_AUDIT_DETAIL ? `${p.detail.slice(0, MAX_AUDIT_DETAIL - 1)}…` : p.detail,
    targetUid: p.targetUid,
    targetName: p.targetName,
    performedBy: p.performedBy,
    performedByName: p.performedByName,
    timestamp: new Date().toISOString(), // legacy ordering/display
    recordedAt: serverTimestamp(), // server-verified; the rules require == request.time
    institutionId: p.institutionId,
  };
}
