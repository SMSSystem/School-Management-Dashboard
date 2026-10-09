// Who can be picked as "a teacher" (a subject's teachers, a department's head):
// senior teachers, regular teachers and institution admins. An institution admin
// already has every write permission a teacher has, so listing one raises no one's
// privileges; the stored `teacherNames` / name maps hold the plain name, and only
// the picker shows the "(Admin)" tag, so nothing downstream sees the tag.
// Pure, so the pickers and the tests share one rule.

export const TEACHING_ROLES = ['senior_teacher', 'regular_teacher', 'institution_admin'] as const;
export type TeachingRole = (typeof TEACHING_ROLES)[number];

export type TeachingStaffMember = {
  id: string;
  name: string;
  role: TeachingRole;
  /** What a picker shows: the name, tagged "(Admin)" for an institution admin. */
  label: string;
};

const isTeachingRole = (role: unknown): role is TeachingRole =>
  typeof role === 'string' && (TEACHING_ROLES as readonly string[]).includes(role);

/** A user's picker label. */
export const staffLabel = (name: string, role: TeachingRole): string =>
  role === 'institution_admin' ? `${name} (Admin)` : name;

/** The teaching staff among some users, sorted by name. Users without a name are kept under their id. */
export function teachingStaff(users: readonly ({ id: string } & Record<string, unknown>)[]): TeachingStaffMember[] {
  return users
    .filter((u) => isTeachingRole(u.role))
    .map((u) => {
      const role = u.role as TeachingRole;
      const name = typeof u.name === 'string' && u.name ? u.name : u.id;
      return { id: u.id, name, role, label: staffLabel(name, role) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** id -> plain name, for showing a stored id (such as a department's head) as a name. */
export function staffNameById(staff: readonly TeachingStaffMember[]): Record<string, string> {
  return Object.fromEntries(staff.map((s) => [s.id, s.name]));
}
