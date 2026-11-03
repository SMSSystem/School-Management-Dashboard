import { deleteDoc, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { deleteBlob, deleteBlobs } from "@/lib/blobStore";
import { noteFileDocs } from "@/lib/lessonNoteFile";
import { existingAssignmentBlobKey } from "@/lib/assignmentFile";
import { queryClient } from "@/lib/queryClient";
import { invalidateUserCounts } from "@/lib/invalidateUserCounts";
import { removeClassFromStudents } from "@/lib/classDeletion";
import { collectionNameFor, FLAT_TABLES, type TableName } from "@/lib/formTables";
import { deleteExamCascade } from "@/lib/examDelete";
import type { ExamActor } from "@/lib/examContent";

// What the Delete button of the Add/Edit/Delete dialog does for each table. Firestore does not cascade, so a lesson
// note, a subject, an assignment, an exam and a class each clean up what hangs off them; every other table is one
// document. Throws if anything fails (the dialog shows "Failed to delete. Please try again."). The exam needs the person
// deleting it for its audit entry.
export async function deleteRecord(table: TableName, institutionId: string, id: string, actor?: ExamActor): Promise<void> {
  if (table === "lesson_note") {
    // Firestore doesn't cascade: each file lives in its own
    // sub-document (up to twelve), so they're all removed in the same
    // batch (also clears an orphan if one ever exists).
    const noteRef = institutionDoc(institutionId, "lessonNotes", id);
    // A file over 500KB lives in the Realtime Database: read the keys
    // first (the sub-documents are about to go), and remove those
    // files only once the records are gone.
    const files = await noteFileDocs(institutionId, id);
    const batch = writeBatch(db);
    files.forEach((f) => batch.delete(doc(noteRef, "attachment", f.id)));
    batch.delete(noteRef);
    await batch.commit();
    void deleteBlobs(institutionId, files.flatMap((f) => (f.blobKey ? [f.blobKey] : [])));
    return;
  }
  if (table === "subject") {
    // Firestore doesn't cascade: the subject's enrollments
    // (subjectEnrollments/{subjectId}_{classId}) are removed in the same
    // batch. Left behind, they kept showing a deleted subject in every
    // enrolled student's "By Subject" attendance.
    const enrollments = await getDocs(
      query(
        institutionCollection(institutionId, "subjectEnrollments"),
        where("subjectId", "==", id),
      ),
    );
    const batch = writeBatch(db);
    enrollments.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(institutionDoc(institutionId, collectionNameFor(table), id));
    await batch.commit();
    return;
  }
  if (table === "assignment") {
    // A teacher file over 500KB lives in the Realtime Database; its
    // key is on the assignment, so read it first and remove the
    // file only once the assignment is gone.
    const blobKey = await existingAssignmentBlobKey(institutionId, id);
    await deleteDoc(institutionDoc(institutionId, collectionNameFor(table), id));
    if (blobKey) void deleteBlob(institutionId, blobKey);
    return;
  }
  if (table === "exam") {
    // An online exam's questions, key, attempts, grades and extra-time entries go first, the exam last (examDelete.ts).
    if (!actor) throw new Error("Deleting an exam needs the person deleting it.");
    await deleteExamCascade({ institutionId, examId: id, actor });
    return;
  }
  if (table === "class") {
    // The class goes from students' additional classes first; the class document last.
    await removeClassFromStudents(institutionId, id);
    queryClient.invalidateQueries({ queryKey: ["users", institutionId] });
    invalidateUserCounts(institutionId);
  }
  const ref = FLAT_TABLES.has(table)
    ? doc(db, collectionNameFor(table), id)
    : institutionDoc(institutionId, collectionNameFor(table), id);
  await deleteDoc(ref);
}
