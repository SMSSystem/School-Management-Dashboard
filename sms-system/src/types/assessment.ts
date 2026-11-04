// Assessment: results, feedback comments, exams, assignments and submissions, rubrics and the gradebook.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes, not the Firebase app.

import type { Timestamp } from "firebase/firestore";

export type ResultDocument = {
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;
  assessmentName: string;
  assessmentType: "coursework" | "exam";
  score: number;
  maxScore: number;
  weight?: number;
  date?: string;
  createdAt: Timestamp;
  // Set only on gradebook-originated results (Gradebook's performSave);
  // absent on manually-entered ones (ResultForm.tsx).
  gradebookColumnId?: string;
  columnWeight?: number;
  source?: "gradebook";
  // Set only on assignment-grading-originated results (ASSIGNMENTS_FEATURE_
  // SPEC.md §4.3) — lets the Gradebook conversion feature (§4.5) find every
  // result one assignment has produced, in either gradingMode. Absent on
  // every other results-writing path (Gradebook's own performSave(),
  // ResultForm.tsx).
  assignmentId?: string;
  // Set only on results written when an online exam's score is released (EXAMS_FEATURE_SPEC.md §5.7); lets the
  // exam find every result it produced. The id is `exam_{examId}_{studentUid}`, so syncing twice never duplicates.
  examId?: string;
};

export type FeedbackCommentDocument = {
  studentId: string;
  teacherId: string;
  classId: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;
  comment: string;
  conductGrade: "G" | "S" | "F" | "U" | "P" | "D";
  commentNumber: number;
  commentNumbers?: number[];
  createdAt: Timestamp | string;
  teacherName?: string;
};

// The 16 fixed classification values from ASSIGNMENTS_FEATURE_SPEC.md §4.1,
// plus 'other' (paired with a required otherTypeLabel — see AssignmentDocument).
export const ASSIGNMENT_VALUE_TYPES = [
  "essay",
  "case_study",
  "project",
  "presentation",
  "portfolio",
  "homework",
  "in_class_activity",
  "self_assessment",
  "peer_assessment",
  "journal",
  "ict_based_task",
  "lab",
  "field_work",
  "report",
  "research_paper",
  "other",
] as const;

export type AssignmentValueType = (typeof ASSIGNMENT_VALUE_TYPES)[number];

export const ASSIGNMENT_VALUE_TYPE_LABELS: Record<AssignmentValueType, string> =
  {
    essay: "Essay",
    case_study: "Case Study",
    project: "Project",
    presentation: "Presentation",
    portfolio: "Portfolio",
    homework: "Homework",
    in_class_activity: "In-Class Activity",
    self_assessment: "Self Assessment",
    peer_assessment: "Peer Assessment",
    journal: "Journal / Diary / Log",
    ict_based_task: "ICT Based Task",
    lab: "Lab",
    field_work: "Field Work",
    report: "Report",
    research_paper: "Research Paper",
    other: "Other",
  };

// departmentId is required by the deployed `assignments` rule's
// isSeniorTeacherFor() check, and teacherId by its per-teacher edit check.
//
// title/type/status/teacherRole/dueDateTimestamp/gradingMode are required
// (not optional) per ASSIGNMENTS_FEATURE_SPEC.md §4.1 — every assignment
// created or edited through AssignmentForm going forward always sets them.
// A backfill script (removed once finished; see git history) was run live against
// every assignment document that predated this feature, so this gap is
// closed for existing data — but the type still can't guarantee it (a
// future direct Admin SDK write could skip these fields the same way),
// so list/assignments/index.tsx and list/assignments/[id]/index.tsx still
// account for a possibly-missing value defensively (e.g. the detail page's
// "—" type-label fallback) rather than trusting these fields blindly.
export type AssignmentDocument = {
  institutionId: string;
  termId: string;
  termName: string;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  departmentId?: string;
  dueDate: string;
  description?: string;
  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp | string;

  title: string;
  type: AssignmentValueType;
  otherTypeLabel?: string; // required (client + rules) when type === 'other'
  status: "draft" | "published";
  // Denormalized at write time, same pattern as departmentId — lets
  // rules/queries filter by role without a get() (ASSIGNMENTS_FEATURE_SPEC.md §2, §6).
  teacherRole: "regular_teacher" | "senior_teacher" | "institution_admin";
  // Denormalized Timestamp twin of the display-only `dueDate` string, added
  // purely so firestore.rules can do retention-window arithmetic it
  // otherwise couldn't (rules can't parse a string into a Timestamp) — see
  // ASSIGNMENTS_FEATURE_SPEC.md §4.1, §9.1.
  dueDateTimestamp: Timestamp;

  // Attachment — base64, same validated-data-URL shape as UserPhotoDocument,
  // produced by src/lib/documentUpload.ts. Optional: an assignment may have
  // no attached file (description-only).
  attachmentDataUrl?: string;
  // A file over ~500KB is kept in the Realtime Database instead (up to 5MB,
  // LARGE_ATTACHMENTS_RTDB_SPEC.md); this is its key (src/lib/blobStore.ts).
  // Never together with attachmentDataUrl.
  attachmentBlobKey?: string;
  attachmentFileName?: string;
  attachmentMimeType?: string; // 'application/pdf' | docx/pptx MIME | 'image/...'
  attachmentSize?: number; // bytes, pre-base64; at most 5MB (500KB when inline)

  rubricId?: string; // -> institutions/{id}/rubrics/{rubricId}

  gradingMode: "gradebook" | "standalone";
  gradebookColumnId?: string; // required iff gradingMode === 'gradebook'
};

// institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId}
// — ASSIGNMENTS_FEATURE_SPEC.md §4.2. Deterministic doc ID (studentId,
// matching the student_parents precedent) — one "current state" document
// per student per assignment. Grade fields are written only by the
// grading role (firestore.rules §5.3), never the student.
export type SubmissionDocument = {
  institutionId: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  classId: string;

  currentAttemptNumber: number;
  fileDataUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  submittedAt: Timestamp;
  status: "submitted" | "late" | "graded";

  grade?: number;
  maxGrade?: number;
  feedback?: string;
  gradedBy?: string;
  gradedByName?: string;
  gradedAt?: Timestamp;

  // Retention (§9) — denormalized from the parent assignment's dueDate at
  // write time. Normally identical across every submission/attempt under
  // one assignment (dueDate + 182d), EXCEPT for a late submission, where
  // deleteAt = max(dueDate + 182d, submittedAt + 182d) instead (§9.1's
  // late-submission correction) — guaranteeing a full ~6-month window
  // regardless of how late the submission was. Computed identically here
  // and in firestore.rules' expectedDeleteAt(), which is what makes the
  // rule's exact-equality check on this field possible at all.
  assignmentDueDate: string;
  deleteAt: Timestamp;
};

// institutions/{institutionId}/assignments/{assignmentId}/submissions/{studentId}/attempts/{attemptNumber}
// — full file kept per attempt (§3 decision 12), not just the current one.
// The current attempt's file is also duplicated onto the parent
// SubmissionDocument above, so "download the current submission" stays a
// single-document read instead of a query for the highest attemptNumber.
/** @expected-unused -- records this Firestore document's shape */
export type SubmissionAttemptDocument = {
  attemptNumber: number;
  fileDataUrl: string; // cleared by the future 4-month trim script (§9.2, Implementation Order step 7)
  fileName: string;
  mimeType: string;
  fileSize: number;
  submittedAt: Timestamp;

  assignmentDueDate: string;
  deleteAt: Timestamp;
};

// institutions/{institutionId}/assignments/{assignmentId}/submissionTombstones/{studentId}
// — ASSIGNMENTS_FEATURE_SPEC.md §9.4. A small, permanent record surviving
// the TTL deletion above (Implementation Order step 7): written the first
// time a student submits, updated (not replaced) on every resubmission.
// Deliberately no deleteAt/assignmentDueDate — exempt from both TTL
// policies by design, so "never submitted" and "submitted, then aged out"
// stay distinguishable after the real submission data is gone.
/** @expected-unused -- records this Firestore document's shape */
export type SubmissionTombstoneDocument = {
  studentId: string;
  firstSubmittedAt: Timestamp;
  lastSubmittedAt: Timestamp;
  attemptCount: number;
  wasGraded: boolean;
};

// institutions/{institutionId}/rubrics/{rubricId} — ASSIGNMENTS_FEATURE_SPEC.md
// §4.4. A shared, reusable library, not owned per-assignment or per-teacher
// (§7's Role Interaction Matrix: any institution_admin/senior_teacher/
// regular_teacher may create or edit any rubric, not just their own).
export type RubricLevel = {
  label: string;
  points: number;
  description?: string;
};

export type RubricCriterion = {
  id: string; // client-generated (crypto.randomUUID()) — distinguishes rows within one rubric's array, not a Firestore doc ID
  name: string;
  maxPoints: number;
  levels: RubricLevel[];
};

// The summary of a rubric's uploaded file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 4). The file's body is never
// on the rubric, because the list page and the assignment form read every rubric.
export type RubricFileMeta = {
  fileName: string;
  mimeType: string;
  size: number; // raw bytes
  uploadedBy: string; // uid; only this person or an admin may replace or remove the file
  uploadedByName: string; // for display; may go stale after a rename
  uploadedAt: Timestamp;
};

export type RubricDocument = {
  institutionId: string;
  title: string;
  description?: string;
  criteria: RubricCriterion[]; // [] on a rubric that holds only a file
  createdBy: string;
  createdByRole: "institution_admin" | "senior_teacher" | "regular_teacher";
  createdAt: Timestamp;
  file?: RubricFileMeta;
  updatedAt?: Timestamp; // when the grid last changed, to tell if it changed after the file was uploaded
};

// institutions/{institutionId}/rubrics/{rubricId}/file/current — read only when someone downloads it.
export type RubricFileDocument = {
  institutionId: string;
  dataUrl: string; // data:<mime>;base64,... at most 700,000 characters
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: Timestamp;
};

/** @expected-unused -- records this Firestore document's shape */
export type GradebookDocument = {
  institutionId: string;
  classId: string;
  subjectId: string;
  termId: string;
  createdBy: string;
  createdAt: Timestamp;
};

export type GradebookColumnDocument = {
  label: string;
  assessmentType: "coursework" | "exam";
  maxScore: number;
  columnWeight: number;
  order: number;
  date?: string;
  institutionId: string;
  subjectId: string;
  createdBy: string;
  createdAt: Timestamp;
};
