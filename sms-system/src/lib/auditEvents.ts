import type { ActivityEventType, AuditEventType } from "./firebase";

// Display labels and categories for the audit and activity logs, shared by the
// Audit Log page, the profile sections and the super-admin Alerts widget. A
// Record over the union means a new event type without a label fails tsc.

export const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  role_change: "Role changed",
  password_reset: "Password reset sent",
  account_created: "Account created",
  account_suspended: "Account deactivated",
  account_reactivated: "Account reactivated",
  account_deleted: "Account deleted",
  permission_change: "Permission changed",
  registration_status_change: "Registration status changed",
  photo_change: "Photo changed",
  session_reset: "Sign-in session cleared",
  profile_edit: "Profile edited",
  attendance_edit: "Attendance saved",
  results_edit: "Results saved",
  comment_edit: "Feedback comment saved",
  lesson_note_edit: "Lesson note saved",
  rubric_file_edit: "Rubric file changed",
  sign_in_email_sent: "Sign-in link emailed",
  exam_edit: "Exam saved",
  exam_publish: "Exam published",
  exam_grade: "Exam graded",
  exam_release: "Exam scores released",
  exam_finalize: "Exam finalized",
};

// Account and security events: what an administrator needs to see first. Kept
// short enough for a Firestore `in` query (limit 30 values).
export const SECURITY_EVENT_TYPES: AuditEventType[] = [
  "account_created",
  "account_suspended",
  "account_reactivated",
  "account_deleted",
  "password_reset",
  "session_reset",
  "permission_change",
  "role_change",
  "registration_status_change",
];

// Routine record changes: frequent, and kept out of the security views.
export const ACADEMIC_EVENT_TYPES: AuditEventType[] = [
  "profile_edit",
  "photo_change",
  "attendance_edit",
  "results_edit",
  "comment_edit",
  "lesson_note_edit",
  "rubric_file_edit",
  "exam_edit",
  "exam_publish",
  "exam_grade",
  "exam_release",
  "exam_finalize",
];

// Emails an administrator sent from the app. Its own category: routine and frequent, so it
// must not fill the security views or the super-admin alerts (which use the security list),
// and it is not an academic record change either.
export const EMAIL_EVENT_TYPES: AuditEventType[] = ["sign_in_email_sent"];

export type AuditCategory = "all" | "security" | "academic" | "emails";

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  all: "All events",
  security: "Account & security",
  academic: "Academic",
  emails: "Emails sent",
};

// The event types a category filters to, or null for "all" (no filter).
export function eventTypesForCategory(
  category: AuditCategory,
): AuditEventType[] | null {
  if (category === "security") return SECURITY_EVENT_TYPES;
  if (category === "academic") return ACADEMIC_EVENT_TYPES;
  if (category === "emails") return EMAIL_EVENT_TYPES;
  return null;
}

export const ACTIVITY_EVENT_LABELS: Record<ActivityEventType, string> = {
  sign_in: "Signed in",
  sign_out: "Signed out",
  profile_update: "Updated contact info",
  password_change: "Changed password",
  photo_update: "Updated profile photo",
  notification_change: "Changed notification preferences",
};

// snake_case -> "Snake case", so a type with no label (an old entry, or one a
// newer build wrote) never shows as a raw slug.
export function humanizeEventType(slug: string): string {
  const spaced = slug.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "—";
}

export function auditEventLabel(eventType: string): string {
  return (
    (AUDIT_EVENT_LABELS as Record<string, string>)[eventType] ??
    humanizeEventType(eventType)
  );
}

export function activityEventLabel(eventType: string): string {
  return (
    (ACTIVITY_EVENT_LABELS as Record<string, string>)[eventType] ??
    humanizeEventType(eventType)
  );
}
