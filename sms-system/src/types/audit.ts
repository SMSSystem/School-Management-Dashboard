// The audit log and the activity log.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes, not the Firebase app.

import type { Timestamp } from "firebase/firestore";

export type ActivityEventType =
  | "sign_in"
  | "sign_out"
  | "profile_update"
  | "password_change"
  | "photo_update"
  | "notification_change";

export type ActivityLogEntry = {
  eventType: ActivityEventType;
  detail: string;
  // Legacy, CLIENT-supplied ISO string: used for ordering and as the display
  // fallback. Not trustworthy — the browser sets it.
  timestamp: string;
  // Server-verified time (firestore.rules require it to equal request.time).
  // Absent on entries written before it existed — show those as unverified.
  recordedAt?: Timestamp;
  uid: string;
  institutionId: string;
};

export type AuditEventType =
  | "role_change"
  | "password_reset"
  | "account_created"
  | "account_suspended"
  | "account_reactivated"
  | "account_deleted"
  | "permission_change"
  | "registration_status_change"
  | "photo_change"
  | "session_reset"
  | "profile_edit"
  | "attendance_edit"
  | "results_edit"
  | "comment_edit"
  | "lesson_note_edit"
  | "sign_in_email_sent"
  | "exam_edit"
  | "exam_publish"
  | "exam_grade"
  | "exam_release"
  | "exam_finalize";

export type AuditLogEntry = {
  eventType: AuditEventType;
  detail: string;
  targetUid: string;
  targetName: string;
  // Rules require this to be the signed-in writer's own uid.
  performedBy: string;
  performedByName: string;
  // Legacy client ISO string (ordering/display); see ActivityLogEntry.
  timestamp: string;
  // Server-verified time; absent on entries written before it existed.
  recordedAt?: Timestamp;
  institutionId: string;
};
