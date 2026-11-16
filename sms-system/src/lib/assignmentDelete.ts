import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "./firebase";
import { buildAuditEntry } from "./auditLog";
import {
  institutionCollection,
  institutionDoc,
  institutionSubcollection,
} from "./paths";
import { chunkOperations } from "./deleteUserData";
import { deleteBlob } from "./blobStore";
import { assignmentDeleteDetail } from "./teacherAudit";
import type { AssignmentDeleteCounts } from "./assignmentDeleteLogic";
import type { ExamActor } from "./examContent";

// The reads and writes behind the Delete button of an assignment (the confirmation's wording is in
// assignmentDeleteLogic.ts). Firestore does not cascade, so every student's submission, its attempts and the
// submission tombstones are deleted first, in batches, and the assignment goes LAST in one batch with its audit
// entry. A failure part-way leaves the assignment in the list, so Delete can be pressed again; with the assignment
// already gone, the leftovers are still cleared. The grades the assignment produced (`results`) are the academic
// record, and in gradebook mode the gradebook's own cells, so they are never touched here. A large teacher file in the
// Realtime Database is removed once the assignment is gone; if that fails, scripts/sweep-orphan-blobs.mjs finds it.

const submissionsOf = (institutionId: string, assignmentId: string) =>
  institutionSubcollection(
    institutionId,
    "assignments",
    assignmentId,
    "submissions",
  );
const tombstonesOf = (institutionId: string, assignmentId: string) =>
  institutionSubcollection(
    institutionId,
    "assignments",
    assignmentId,
    "submissionTombstones",
  );

/** What the confirmation shows: how many submissions go with the assignment and how many grades stay. Two aggregate reads. */
export async function loadAssignmentDeletePreflight(
  institutionId: string,
  assignmentId: string,
): Promise<AssignmentDeleteCounts> {
  const [submissions, grades] = await Promise.all([
    getCountFromServer(submissionsOf(institutionId, assignmentId)),
    getCountFromServer(
      query(
        institutionCollection(institutionId, "results"),
        where("assignmentId", "==", assignmentId),
      ),
    ),
  ]);
  return {
    submissions: submissions.data().count,
    results: grades.data().count,
  };
}

/** Deletes an assignment with its submissions, their attempts and the tombstones, then the assignment with an audit entry. */
export async function deleteAssignmentCascade(p: {
  institutionId: string;
  assignmentId: string;
  actor: ExamActor;
}): Promise<void> {
  const assignmentRef = institutionDoc(
    p.institutionId,
    "assignments",
    p.assignmentId,
  );
  const snap = await getDoc(assignmentRef);

  const [submissionDocs, tombstoneDocs] = await Promise.all([
    getDocs(submissionsOf(p.institutionId, p.assignmentId)),
    getDocs(tombstonesOf(p.institutionId, p.assignmentId)),
  ]);
  const attemptDocs = await Promise.all(
    submissionDocs.docs.map((s) => getDocs(collection(s.ref, "attempts"))),
  );

  const refs: DocumentReference[] = [
    ...attemptDocs.flatMap((a) => a.docs.map((d) => d.ref)),
    ...submissionDocs.docs.map((d) => d.ref),
    ...tombstoneDocs.docs.map((d) => d.ref),
  ];
  for (const group of chunkOperations(refs)) {
    const batch = writeBatch(db);
    for (const ref of group) batch.delete(ref);
    await batch.commit();
  }
  if (!snap.exists()) return; // a delete finished earlier: only leftovers were cleared

  const assignment = snap.data() as {
    title?: string;
    className?: string;
    subjectName?: string;
    attachmentBlobKey?: unknown;
  };
  const last = writeBatch(db);
  last.delete(assignmentRef);
  last.set(
    doc(institutionCollection(p.institutionId, "audit_log")),
    buildAuditEntry({
      institutionId: p.institutionId,
      eventType: "assignment_delete",
      detail: assignmentDeleteDetail({
        title: assignment.title ?? "",
        className: assignment.className,
        subjectName: assignment.subjectName,
        submissions: submissionDocs.size,
      }),
      targetUid: p.assignmentId,
      targetName: assignment.title ?? "",
      performedBy: p.actor.uid,
      performedByName: p.actor.name,
    }),
  );
  await last.commit();
  if (typeof assignment.attachmentBlobKey === "string")
    void deleteBlob(p.institutionId, assignment.attachmentBlobKey);
}
