import type { Role } from './firebase';

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

const ADMIN_VIEW: readonly Role[] = ['super_admin', 'institution_admin', 'spectator'];
const STAFF_VIEW: readonly Role[] = [...ADMIN_VIEW, 'senior_teacher', 'regular_teacher'];
const WRITERS: readonly Role[] = ['super_admin', 'institution_admin', 'senior_teacher', 'regular_teacher'];
const MANAGERS: readonly Role[] = ['super_admin', 'institution_admin'];

const has = (set: readonly Role[], role: MaybeRole): boolean => !!role && set.includes(role);

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
