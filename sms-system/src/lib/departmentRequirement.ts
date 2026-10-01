// A teacher's department decides whether a senior_teacher can see or edit
// their notes and assignments: firestore.rules matches the author's
// departmentId (stamped onto each document at write time) against the
// senior's own. A teacher with no department therefore writes documents no
// senior can ever match, so one is required — but only where it is possible
// to pick one: an institution with no departments yet can't require a choice.

export const DEPARTMENT_REQUIRED_MESSAGE = 'Select a department.';

export const NO_DEPARTMENT_NOTICE =
  "You have no department, so senior teachers can't see what you save here. " +
  'Ask your administrator to assign you one.';

export function isTeacherRole(role: string | null | undefined): boolean {
  return role === 'regular_teacher' || role === 'senior_teacher';
}

// True when this role must have a department in an institution with this
// many departments.
export function departmentRequired(
  role: string | null | undefined,
  institutionHasDepartments: boolean,
): boolean {
  return isTeacherRole(role) && institutionHasDepartments;
}

// True when a required department is absent. null, undefined and '' all mean
// "no department" (TeacherForm has written null, AdminCreateUserForm omits the
// field, and older code wrote '').
export function isDepartmentMissing(
  role: string | null | undefined,
  departmentId: string | null | undefined,
  institutionHasDepartments: boolean,
): boolean {
  return departmentRequired(role, institutionHasDepartments) && !departmentId;
}
