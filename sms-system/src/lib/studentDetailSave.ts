import { doc, addDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ParentRelationship } from '@/lib/firebase';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import { addParentClassUpdates, parentClassUpdates } from '@/lib/parentLinkedClasses';

// Every write of the student detail page (scenes/(dashboard)/list/students/[id]): linking and unlinking a
// parent, a term's activities and positions of responsibility, and the report card comments. The page keeps
// the checks that come before a write and the messages that follow a failure; the writes are moved as they were.

export async function linkParent({
  parentId,
  studentId,
  institutionId,
  relationship,
  uid,
}: {
  parentId: string;
  studentId: string;
  institutionId: string;
  relationship: ParentRelationship;
  uid: string;
}): Promise<void> {
  // The parent's children's classes go with the link, in the same batch (lib/parentLinkedClasses.ts).
  const updates = await parentClassUpdates(institutionId, [{ parentId, add: [studentId] }]);
  const batch = writeBatch(db);
  batch.set(doc(db, "student_parents", `${parentId}_${studentId}`), {
    parentId,
    studentId,
    institutionId,
    relationship,
    createdAt: serverTimestamp(),
    createdBy: uid,
  });
  addParentClassUpdates(batch, updates);
  await batch.commit();
}

export async function unlinkParent({
  docId,
  parentId,
  studentId,
  institutionId,
}: {
  docId: string;
  parentId: string;
  studentId: string;
  institutionId: string;
}): Promise<void> {
  const updates = await parentClassUpdates(institutionId, [{ parentId, remove: [studentId] }]);
  const batch = writeBatch(db);
  batch.delete(doc(db, "student_parents", docId));
  addParentClassUpdates(batch, updates);
  await batch.commit();
}

export async function addActivity({
  institutionId,
  studentId,
  classId,
  termId,
  academicYearId,
  activityName,
  uid,
}: {
  institutionId: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  activityName: string;
  uid: string;
}): Promise<void> {
  await addDoc(institutionCollection(institutionId, "studentActivities"), {
    institutionId,
    studentId,
    classId,
    termId,
    academicYearId,
    activityName: activityName.trim(),
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteActivity(institutionId: string, activityId: string): Promise<void> {
  await deleteDoc(
    institutionDoc(institutionId, "studentActivities", activityId),
  );
}

export async function addResponsibility({
  institutionId,
  studentId,
  classId,
  termId,
  academicYearId,
  title,
  organisation,
  uid,
}: {
  institutionId: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  title: string;
  organisation: string;
  uid: string;
}): Promise<void> {
  await addDoc(
    institutionCollection(institutionId, "studentResponsibilities"),
    {
      institutionId,
      studentId,
      classId,
      termId,
      academicYearId,
      title: title.trim(),
      organisation: organisation.trim() || null,
      createdAt: serverTimestamp(),
      createdBy: uid,
      updatedAt: serverTimestamp(),
    },
  );
}

export async function deleteResponsibility(institutionId: string, responsibilityId: string): Promise<void> {
  await deleteDoc(
    institutionDoc(
      institutionId,
      "studentResponsibilities",
      responsibilityId,
    ),
  );
}

/** Updates the term's comments document when there is one, otherwise adds it. */
export async function saveReportCardComments({
  institutionId,
  studentId,
  termId,
  academicYearId,
  classSupervisorComment,
  gradeSupervisorComment,
  principalComment,
  vicePrincipalComment,
  uid,
  commentDocId,
}: {
  institutionId: string;
  studentId: string;
  termId: string;
  academicYearId: string;
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
  uid: string;
  commentDocId: string | null;
}): Promise<void> {
  const payload = {
    institutionId,
    studentId,
    termId,
    academicYearId,
    classSupervisorComment,
    gradeSupervisorComment,
    principalComment,
    vicePrincipalComment,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
  if (commentDocId) {
    await updateDoc(
      institutionDoc(institutionId, "reportCardComments", commentDocId),
      payload,
    );
  } else {
    await addDoc(
      institutionCollection(institutionId, "reportCardComments"),
      payload,
    );
  }
}
