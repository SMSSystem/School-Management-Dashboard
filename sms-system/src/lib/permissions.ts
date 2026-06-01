import type { UserDocument } from './firebase';

/**
 * Returns true when the given role/user combination is permitted to create,
 * edit, or delete timetable slots.
 *
 * Single extension point: to grant all senior_teacher users schedule access
 * (role-level delegation, Issue S-4), add `|| role === 'senior_teacher'` to
 * the second condition — no data model changes required.
 */
export function canGenerateSchedule(role: string, user: UserDocument | null): boolean {
  if (role === 'super_admin' || role === 'institution_admin') return true;
  if (role === 'senior_teacher' && user?.canGenerateSchedule === true) return true;
  return false;
}
