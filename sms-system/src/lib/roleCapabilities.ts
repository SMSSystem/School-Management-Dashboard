import type { Role } from "./firebase";

/**
 * What each role may SEE and what it may CHANGE, in one place.
 *
 * The spectator role reads everything an institution admin reads and writes
 * nothing (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md). Pages used to
 * compare `role === "institution_admin"` for both questions at once, which
 * cannot express that. Rule of thumb:
 *
 *   - views, routes, sidebar entries and query scope: hasAdminView / hasStaffView;
 *   - create/edit/delete buttons, forms, saves, imports, generate actions and
 *     toggles: canWrite (any institution data writer) or canManage (admin level);
 *   - a page keeps its own finer rule on top (for example a teacher editing
 *     only their own record) and uses canWrite/canManage as the guard that a
 *     spectator never passes.
 *
 * This only drives the UI. firestore.rules is what actually enforces access,
 * and it must stay in step (see the checklist above isSpectator() there).
 * The self-service writes every signed-in user needs (sign-in log, session
 * lock, password change, tour flags) are not governed by these functions.
 *
 * A missing role (not signed in yet) has no access: every function returns false.
 */

type MaybeRole = Role | null | undefined;

const ADMIN_VIEW: readonly Role[] = [
  "super_admin",
  "institution_admin",
  "spectator",
];
const STAFF_VIEW: readonly Role[] = [
  ...ADMIN_VIEW,
  "senior_teacher",
  "regular_teacher",
];
const WRITERS: readonly Role[] = [
  "super_admin",
  "institution_admin",
  "senior_teacher",
  "regular_teacher",
];
const MANAGERS: readonly Role[] = ["super_admin", "institution_admin"];
// Teachers and institution admins attach lesson-note and assignment files of up
// to 5 MiB (LARGE_ATTACHMENTS_RTDB_SPEC.md D9). super_admin is not listed (it
// does not author these); student, parent and spectator keep the 500 KiB limit
// or have no upload controls at all.
const LARGE_UPLOADERS: readonly Role[] = [
  "institution_admin",
  "senior_teacher",
  "regular_teacher",
];

const has = (set: readonly Role[], role: MaybeRole): boolean =>
  !!role && set.includes(role);

/** May see what an institution admin sees (super_admin, institution_admin, spectator). */
export const hasAdminView = (role: MaybeRole): boolean => has(ADMIN_VIEW, role);

/** May see what staff see: everything hasAdminView covers, plus both teacher roles. */
export const hasStaffView = (role: MaybeRole): boolean => has(STAFF_VIEW, role);

/**
 * May change institution data at all (super_admin, institution_admin and both
 * teacher roles). False for student, parent, spectator and a missing role.
 */
export const canWrite = (role: MaybeRole): boolean => has(WRITERS, role);

/**
 * Admin-level writes (super_admin, institution_admin): the replacement for
 * `role === "institution_admin" || role === "super_admin"` on create, edit and
 * delete controls.
 */
export const canManage = (role: MaybeRole): boolean => has(MANAGERS, role);

/**
 * May attach a lesson-note file or an assignment attachment over 500 KiB (up to
 * 5 MiB, stored in the Realtime Database). A UI choice only: database.rules.json
 * cannot tell roles apart, so it does not enforce this.
 */
export const canUploadLargeFiles = (role: MaybeRole): boolean =>
  has(LARGE_UPLOADERS, role);

// Rubric files (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 11). firestore.rules enforces who may read and change a
// file; these only decide which controls to show. super_admin waits for an institution picker, and a spectator views rubrics
// without downloading them.
const RUBRIC_AUTHORS: readonly Role[] = [
  "institution_admin",
  "senior_teacher",
  "regular_teacher",
];
const RUBRIC_DOWNLOADERS: readonly Role[] = [
  ...RUBRIC_AUTHORS,
  "student",
  "parent",
];

/** May open the Rubrics page: staff view, without super_admin, whose page has no institution to load. */
export const canOpenRubrics = (role: MaybeRole): boolean =>
  hasStaffView(role) && role !== "super_admin";

/** May upload a rubric file and type or edit any rubric's grid. */
export const canUploadRubric = (role: MaybeRole): boolean =>
  has(RUBRIC_AUTHORS, role);

/** May download a rubric's original file or a generated copy. */
export const canDownloadRubric = (role: MaybeRole): boolean =>
  has(RUBRIC_DOWNLOADERS, role);

/** May replace or remove this file: an admin, or the teacher who uploaded it. */
export function canControlRubricFile(
  role: MaybeRole,
  uid: string | null | undefined,
  file: { uploadedBy: string } | undefined,
): boolean {
  if (role === "institution_admin") return true;
  return (
    (role === "senior_teacher" || role === "regular_teacher") &&
    !!file &&
    file.uploadedBy === uid
  );
}

/** May delete this rubric: an admin, or a teacher who created it and uploaded its file. A typed rubric stays admin-only. */
export function canDeleteRubric(
  role: MaybeRole,
  uid: string | null | undefined,
  rubric: { createdBy: string; file?: { uploadedBy: string } },
): boolean {
  if (role === "institution_admin") return true;
  return (
    canControlRubricFile(role, uid, rubric.file) && rubric.createdBy === uid
  );
}
