import {
  arrayRemove,
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildAuditEntry } from './auditLog';
import { institutionCollection } from './paths';
import { findUserPhotoDocs } from './userPhoto';
import { queryClient } from './queryClient';
import { invalidateUserCounts } from './invalidateUserCounts';
import type { InstitutionUserDoc } from '@/hooks/useInstitutionUsers';
import {
  STUDENT_RECORD_COLLECTIONS,
  chunkOperations,
  deletionAuditDetail,
  isDeletableRole,
} from './deleteUserData';

// The reads and writes behind the "Delete user" button (the pure rules live in
// deleteUserData.ts). Everything is found by one equality query per collection
// (no composite index) and removed in batches; the users document goes LAST,
// in the same batch as the audit entry, so a failure part-way leaves the person
// in the list and the admin can simply run it again.

export type DeletionOp =
  | { kind: 'delete'; ref: DocumentReference; label: string }
  | { kind: 'removeFromSubject'; ref: DocumentReference; label: string };

export type DeletionPlan = {
  ops: DeletionOp[];
  /** Count per label, for the confirmation screen. */
  summary: { label: string; count: number }[];
};

/** Find everything that will be removed for this person. Read-only. */
export async function planUserDeletion(
  institutionId: string,
  uid: string,
  role: string,
): Promise<DeletionPlan> {
  if (!isDeletableRole(role)) throw new Error(`Role ${role} cannot be deleted.`);
  const ops: DeletionOp[] = [];

  // A filtered query, not getDoc: reading a photo that does not exist is denied by the rules.
  for (const photo of await findUserPhotoDocs(uid, institutionId)) {
    ops.push({ kind: 'delete', ref: photo.ref, label: 'profile photo' });
  }

  if (role === 'student') {
    const lookups = [
      ...STUDENT_RECORD_COLLECTIONS.map(async (name) => {
        const snap = await getDocs(query(institutionCollection(institutionId, name), where('studentId', '==', uid)));
        snap.docs.forEach((d) => ops.push({ kind: 'delete', ref: d.ref, label: name }));
      }),
      (async () => {
        const snap = await getDocs(
          query(
            collection(db, 'student_parents'),
            where('studentId', '==', uid),
            where('institutionId', '==', institutionId),
          ),
        );
        snap.docs.forEach((d) => ops.push({ kind: 'delete', ref: d.ref, label: 'parent links' }));
      })(),
    ];
    await Promise.all(lookups);
  } else {
    const snap = await getDocs(
      query(institutionCollection(institutionId, 'subjects'), where('teacherIds', 'array-contains', uid)),
    );
    snap.docs.forEach((d) => ops.push({ kind: 'removeFromSubject', ref: d.ref, label: 'subjects they teach' }));
  }

  const counts = new Map<string, number>();
  for (const op of ops) counts.set(op.label, (counts.get(op.label) ?? 0) + 1);
  return { ops, summary: [...counts].map(([label, count]) => ({ label, count })) };
}

/** Run a plan, then remove the users document and write the audit entry. */
export async function executeUserDeletion(p: {
  institutionId: string;
  uid: string;
  name: string;
  role: string;
  plan: DeletionPlan;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  for (const group of chunkOperations(p.plan.ops)) {
    const batch = writeBatch(db);
    for (const op of group) {
      if (op.kind === 'delete') batch.delete(op.ref);
      else batch.update(op.ref, { teacherIds: arrayRemove(p.uid) });
    }
    await batch.commit();
  }

  const last = writeBatch(db);
  last.delete(doc(db, 'users', p.uid));
  last.set(
    doc(institutionCollection(p.institutionId, 'audit_log')),
    buildAuditEntry({
      institutionId: p.institutionId,
      eventType: 'account_deleted',
      detail: deletionAuditDetail(p.role, p.name, p.plan.ops.length),
      targetUid: p.uid,
      targetName: p.name,
      performedBy: p.actorUid,
      performedByName: p.actorName,
    }),
  );
  await last.commit();

  queryClient.setQueryData<InstitutionUserDoc[]>(['users', p.institutionId], (rows) =>
    rows?.filter((r) => r.id !== p.uid),
  );
  queryClient.invalidateQueries({ queryKey: ['classStudents', p.institutionId] });
  invalidateUserCounts(p.institutionId);
  if (p.role !== 'student') queryClient.invalidateQueries({ queryKey: ['subjects', p.institutionId] });
}
