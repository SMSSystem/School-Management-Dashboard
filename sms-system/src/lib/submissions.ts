// Student submission write flow — ASSIGNMENTS_FEATURE_SPEC.md §4.2/§5.3/§9.4
// (Implementation Order step 5). One client-side batch per submit/resubmit:
// the SubmissionDocument "current state", a new SubmissionAttemptDocument,
// and the SubmissionTombstoneDocument (created on first submission, updated
// on every resubmission after).

import { doc, getDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { processDocumentUpload } from './documentUpload';
import { computeDeleteAt, computeStatus } from './submissionRetention';

export type SubmitAssignmentWorkParams = {
  institutionId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: string;
  assignmentDueDate: string; // AssignmentDocument.dueDate, denormalized onto the submission/attempt
  dueDateTimestamp: Timestamp; // AssignmentDocument.dueDateTimestamp
  file: File;
};

export async function submitAssignmentWork(params: SubmitAssignmentWorkParams): Promise<void> {
  const {
    institutionId,
    assignmentId,
    studentId,
    studentName,
    classId,
    assignmentDueDate,
    dueDateTimestamp,
    file,
  } = params;

  const processed = await processDocumentUpload(file);

  const submissionRef = doc(
    db,
    'institutions', institutionId,
    'assignments', assignmentId,
    'submissions', studentId,
  );
  const tombstoneRef = doc(
    db,
    'institutions', institutionId,
    'assignments', assignmentId,
    'submissionTombstones', studentId,
  );

  const [existingSubmissionSnap, existingTombstoneSnap] = await Promise.all([
    getDoc(submissionRef),
    getDoc(tombstoneRef),
  ]);

  const currentAttemptNumber =
    ((existingSubmissionSnap.data()?.currentAttemptNumber as number | undefined) ?? 0) + 1;

  const attemptRef = doc(
    db,
    'institutions', institutionId,
    'assignments', assignmentId,
    'submissions', studentId,
    'attempts', String(currentAttemptNumber),
  );

  // A concrete client Timestamp, deliberately not serverTimestamp() — the
  // rule's expectedDeleteAt()/expectedSubmissionStatus() recompute deleteAt/
  // status from this exact field value via request.resource.data.submittedAt,
  // so this write and the rule's check must start from the identical value.
  // A serverTimestamp() sentinel would resolve to request.time at rule
  // evaluation, which this client can't know in advance to derive a
  // matching deleteAt/status from before the write actually lands.
  const submittedAt = Timestamp.now();
  const deleteAt = computeDeleteAt(dueDateTimestamp, submittedAt);
  const status = computeStatus(dueDateTimestamp, submittedAt);

  const batch = writeBatch(db);

  if (existingSubmissionSnap.exists()) {
    batch.update(submissionRef, {
      currentAttemptNumber,
      fileDataUrl: processed.dataUrl,
      fileName: processed.fileName,
      mimeType: processed.mimeType,
      fileSize: processed.size,
      submittedAt,
      status,
      deleteAt,
    });
  } else {
    batch.set(submissionRef, {
      institutionId,
      assignmentId,
      studentId,
      studentName,
      classId,
      currentAttemptNumber,
      fileDataUrl: processed.dataUrl,
      fileName: processed.fileName,
      mimeType: processed.mimeType,
      fileSize: processed.size,
      submittedAt,
      status,
      assignmentDueDate,
      deleteAt,
    });
  }

  batch.set(attemptRef, {
    attemptNumber: currentAttemptNumber,
    fileDataUrl: processed.dataUrl,
    fileName: processed.fileName,
    mimeType: processed.mimeType,
    fileSize: processed.size,
    submittedAt,
    assignmentDueDate,
    deleteAt,
  });

  if (existingTombstoneSnap.exists()) {
    batch.update(tombstoneRef, {
      lastSubmittedAt: submittedAt,
      attemptCount: ((existingTombstoneSnap.data()?.attemptCount as number | undefined) ?? 0) + 1,
    });
  } else {
    batch.set(tombstoneRef, {
      studentId,
      firstSubmittedAt: submittedAt,
      lastSubmittedAt: submittedAt,
      attemptCount: 1,
      wasGraded: false,
    });
  }

  await batch.commit();
}
