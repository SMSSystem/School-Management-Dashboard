import { addDoc } from 'firebase/firestore';
import { institutionCollection } from './paths';
import { buildAuditEntry, type AuditEventInput } from './auditEntry';

export { actorName, buildAuditEntry, AUDIT_ENTRY_KEYS, MAX_AUDIT_DETAIL, type AuditEventInput } from './auditEntry';

// Best-effort: for callers that cannot batch with the primary write (account
// creation, the password-reset email, a lone updateDoc). They swallow failures
// themselves. A caller that CAN batch uses buildAuditEntry() with batch.set()
// so the change and its record are never apart.
export async function logAuditEvent(p: AuditEventInput): Promise<void> {
  await addDoc(institutionCollection(p.institutionId, 'audit_log'), buildAuditEntry(p));
}
