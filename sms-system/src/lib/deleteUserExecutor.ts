import {
  deleteField,
  collection,
  doc,
  getDoc,
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
import { findStudentExamRecords } from './studentExamRecords';
import { withoutTeacher } from './subjectTeachers';
import { queryClient } from './queryClient';
import { invalidateUserCounts } from './invalidateUserCounts';
import { classIdsOf } from './studentClasses';
import { populationDelta } from './classPopulationDelta';
import { addPopulationDelta } from './classPopulationWrite';
import { addParentClassUpdates, parentClassUpdates } from './parentLinkedClasses';
import { fetchInstitutionClasses } from '@/hooks/useInstitutionClasses';
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

const PARENT_LINKS_LABEL = 'parent links';

export type DeletionOp =
  | { kind: 'delete'; ref: DocumentReference; label: string }
  // Counted for the dialog only: the subject is re-read when the deletion runs.
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
        snap.docs.forEach((d) => ops.push({ kind: 'delete', ref: d.ref, label: PARENT_LINKS_LABEL }));
      })(),
      // The attempt, score and extra time the student has in the online exams of their classes.
      (async () => {
        for (const record of await findStudentExamRecords(institutionId, uid)) ops.push({ kind: 'delete', ref: record.ref, label: record.label });
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
  for (const group of chunkOperations(p.plan.ops.filter((op) => op.kind === 'delete'))) {
    const batch = writeBatch(db);
    for (const op of group) batch.delete(op.ref);
    await batch.commit();
  }

  // The teacher's subjects are read again NOW, not taken from the dialog's plan, so a
  // subject another admin edited since the dialog opened is not overwritten with old arrays.
  if (p.role !== 'student') {
    const fresh = await getDocs(
      query(institutionCollection(p.institutionId, 'subjects'), where('teacherIds', 'array-contains', p.uid)),
    );
    for (const group of chunkOperations(fresh.docs)) {
      const batch = writeBatch(db);
      for (const d of group) {
        const next = withoutTeacher(d.data(), p.uid);
        // Both aligned arrays, and the assistant label if this person was the assistant.
        batch.update(d.ref, {
          teacherIds: next.teacherIds,
          teacherNames: next.teacherNames,
          ...(next.clearAssistant ? { assistantTeacherId: deleteField(), assistantTeacherName: deleteField() } : {}),
        });
      }
      await batch.commit();
    }
  }

  const last = writeBatch(db);
  last.delete(doc(db, 'users', p.uid));
  if (p.role === 'student') {
    // The student's parents no longer have this child's classes (lib/parentLinkedClasses.ts). The links are already
    // gone, so the parents come from the plan: a link's id is parentId_studentId.
    const parentIds = p.plan.ops.filter((op) => op.label === PARENT_LINKS_LABEL).map((op) => op.ref.id.slice(0, -(p.uid.length + 1)));
    addParentClassUpdates(
      last,
      await parentClassUpdates(p.institutionId, parentIds.map((parentId) => ({ parentId, remove: [p.uid] }))),
    );
    // The student leaves every class they are in: the class head-counts (lib/classPopulationDelta.ts) move in this
    // last batch, with the document, so a delete that stopped part-way leaves them untouched. The student is read
    // now, not taken from the list row, which can be minutes old.
    const stored = (await getDoc(doc(db, 'users', p.uid))).data();
    if (stored) {
      const classIds = new Set((await fetchInstitutionClasses(p.institutionId)).map((c) => c.id));
      addPopulationDelta(
        last,
        p.institutionId,
        populationDelta({ classIds: classIdsOf(stored), gender: stored.gender, status: stored.status }, null, classIds),
      );
    }
  }
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
