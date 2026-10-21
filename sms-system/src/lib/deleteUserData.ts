import { MAX_BATCH_OPERATIONS } from './auditEntry';

// The pure half of "Delete user": which accounts may be deleted, which stored
// records belong to a deleted student, and the checks around the button. No
// Firebase import, so it can be unit-tested directly (deleteUserExecutor.ts does
// the reads and writes).
//
// What "delete" means here: the person's own records, and their users document
// last. Content a teacher AUTHORED (assignments, exams, lessons, notes, graded
// results, timetable slots) is kept, because students depend on it; a teacher is
// only taken out of the subjects they teach. The Firebase Auth account cannot be
// deleted from a browser, so scripts/remove-orphan-auth-accounts.mjs removes it.

/** Roles an institution admin may delete. Never admins, parents or spectators. */
export const DELETABLE_ROLES = ['student', 'regular_teacher', 'senior_teacher'] as const;

export function isDeletableRole(role: unknown): boolean {
  return typeof role === 'string' && (DELETABLE_ROLES as readonly string[]).includes(role);
}

/** Collections under institutions/{id}/ whose documents carry a studentId field. */
export const STUDENT_RECORD_COLLECTIONS = [
  'results',
  'feedback_comments',
  'reportCards',
  'reportCardComments',
  'progressReports',
  'disciplinaryActions',
  'studentActivities',
  'studentResponsibilities',
  'attendanceSummaries',
] as const;

/**
 * A student's online-exam records, one document per exam under the student's uid (not a studentId field, so they are
 * found per exam: lib/studentExamRecords.ts). The exam, its questions and key stay; the `results` entry is deleted
 * with the other student-keyed collections above.
 */
export const STUDENT_EXAM_RECORDS = [
  { collection: 'attempts', label: 'exam attempts' },
  { collection: 'grades', label: 'exam scores' },
  { collection: 'accommodations', label: 'exam extra time' },
] as const;

/**
 * Stored inside documents that belong to a whole class, not to one person, so they
 * are NOT removed (it would mean rewriting shared registers). Shown to the admin
 * before they confirm.
 */
export const KEPT_STUDENT_NOTES = [
  'the student\'s mark and name inside class attendance registers',
  'the student\'s grades and name inside gradebooks',
] as const;

/** The admin must type the person's name exactly (ignoring case and outer spaces). */
export function confirmationMatches(typed: string, name: string): boolean {
  const want = name.trim().toLowerCase();
  return want.length > 0 && typed.trim().toLowerCase() === want;
}

/**
 * Whether "Delete permanently" is enabled: the records are counted, the name is typed
 * correctly, the "cannot be undone" box is ticked, and no deletion is running.
 */
export function canConfirmDeletion(s: {
  planLoaded: boolean;
  typedOk: boolean;
  acknowledged: boolean;
  busy: boolean;
}): boolean {
  return s.planLoaded && s.typedOk && s.acknowledged && !s.busy;
}

/** Never on yourself, never across institutions, and only the roles above. */
export function deleteBlockReason(
  target: { uid: string; role?: unknown },
  actorUid: string | null | undefined,
): string | null {
  if (!actorUid) return 'You are not signed in.';
  if (target.uid === actorUid) return 'You cannot delete your own account.';
  if (!isDeletableRole(target.role)) return 'Only student and teacher accounts can be deleted.';
  return null;
}

/** Split operations into batches that leave room for the final batch's own writes. */
export function chunkOperations<T>(items: readonly T[], size = MAX_BATCH_OPERATIONS - 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The audit entry text (the rules cap it at 300 characters). */
export function deletionAuditDetail(role: string, name: string, removed: number): string {
  const label = role === 'student' ? 'student' : 'teacher';
  return `Deleted the ${label} account of ${name} and ${removed} related record${removed === 1 ? '' : 's'}`;
}
