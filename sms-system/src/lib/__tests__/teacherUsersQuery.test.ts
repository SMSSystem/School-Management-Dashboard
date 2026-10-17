import { describe, expect, it } from 'vitest';
import hookRaw from '../../hooks/useInstitutionUsers.ts?raw';
import accountToggleRaw from '../../components/AccountStatusToggle.tsx?raw';
import sendButtonRaw from '../../components/SendLoginEmailButton.tsx?raw';
import { isTeacherRole } from '../departmentRequirement';

// The users read rule (firestore.rules, match /users/{uid}) lets a teacher read STUDENT profiles in
// their institution, and Firestore refuses a query that could return any other profile, in full.
// useInstitutionUsers() asked for every user of the institution, so for a teacher it was refused: the
// Students, Teachers and Parents lists are built from it, so a teacher's Students list was always
// empty and nothing said why. React Query swallowed the error until the query cache started
// reporting failed queries (lib/reportError.ts), and a sweep of the built app as the QA teachers
// showed the new toast on those pages. A probe of the live rules as both QA teachers: the query for
// every user DENIED, the same query with `role == 'student'` ALLOWED (5 students).

const norm = (s: string) => s.split('\r\n').join('\n');
const hook = norm(hookRaw);

describe('useInstitutionUsers for a teacher', () => {
  it('asks for the students alone, so the read rule can hold', () => {
    expect(hook).toContain('const studentsOnly = isTeacherRole(role);');
    expect(hook).toContain("if (studentsOnly) constraints.push(where('role', '==', 'student'));");
    expect(hook).toContain("const constraints = [where('institutionId', '==', institutionId)];");
  });

  it('keeps the administrators’ cache key exactly, because two admin-only components write to it', () => {
    expect(hook).toContain("queryKey: studentsOnly ? ['users', institutionId, 'students'] : ['users', institutionId],");
    expect(norm(accountToggleRaw)).toContain('["users", institutionId]');
    expect(norm(sendButtonRaw)).toContain('["users", institutionId]');
  });

  it('treats exactly the two teacher roles as teachers', () => {
    expect(isTeacherRole('regular_teacher')).toBe(true);
    expect(isTeacherRole('senior_teacher')).toBe(true);
    for (const role of ['institution_admin', 'super_admin', 'spectator', 'student', 'parent', null, undefined]) {
      expect(isTeacherRole(role), String(role)).toBe(false);
    }
  });
});
