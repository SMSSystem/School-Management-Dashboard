import { describe, expect, it } from 'vitest';
import { TEACHING_ROLES, staffLabel, staffNameById, teachingStaff } from '../teachingStaff';
import hookRaw from '../../hooks/useTeachingStaff.ts?raw';
import subjectFormRaw from '../../components/forms/SubjectForm.tsx?raw';
import departmentFormRaw from '../../components/forms/DepartmentForm.tsx?raw';
import departmentsListRaw from '../../scenes/(dashboard)/list/departments/index.tsx?raw';
import assignmentFormRaw from '../../components/forms/AssignmentForm.tsx?raw';
import examFormRaw from '../../components/forms/ExamForm.tsx?raw';
import timetableFormRaw from '../../components/forms/TimetableSlotForm.tsx?raw';

// Institution admins are selectable as teachers (a subject's teachers, a department's
// head, and the places that read a subject's teachers). Pure logic is tested directly;
// the pickers are checked as source text, like the other guards in this folder.

const lf = (s: string) => s.split('\r\n').join('\n');
const user = (id: string, role: string, name?: string) => ({ id, role, ...(name !== undefined ? { name } : {}) });

describe('teachingStaff', () => {
  it('keeps senior teachers, regular teachers and institution admins only', () => {
    expect(TEACHING_ROLES).toEqual(['senior_teacher', 'regular_teacher', 'institution_admin']);
    const staff = teachingStaff([
      user('a', 'regular_teacher', 'Ann'),
      user('b', 'student', 'Bob'),
      user('c', 'institution_admin', 'Cy'),
      user('d', 'parent', 'Di'),
      user('e', 'senior_teacher', 'Ed'),
      user('f', 'spectator', 'Flo'),
      user('g', 'super_admin', 'Gus'),
    ]);
    expect(staff.map((s) => s.id)).toEqual(['a', 'c', 'e']);
  });

  it('sorts by name and tags only an institution admin', () => {
    const staff = teachingStaff([user('1', 'institution_admin', 'Zed'), user('2', 'regular_teacher', 'Amy')]);
    expect(staff.map((s) => s.label)).toEqual(['Amy', 'Zed (Admin)']);
    expect(staff.map((s) => s.name)).toEqual(['Amy', 'Zed']); // the stored name is never tagged
  });

  it('falls back to the id when a user has no name', () => {
    expect(teachingStaff([user('u1', 'regular_teacher')])[0]).toMatchObject({ name: 'u1', label: 'u1' });
    expect(teachingStaff([user('u2', 'institution_admin', '')])[0]).toMatchObject({ name: 'u2', label: 'u2 (Admin)' });
  });

  it('ignores a user with a missing or odd role', () => {
    expect(teachingStaff([{ id: 'x' }, { id: 'y', role: 5 }, { id: 'z', role: 'toString' }] as never)).toEqual([]);
  });

  it('staffLabel and staffNameById', () => {
    expect(staffLabel('Ann', 'regular_teacher')).toBe('Ann');
    expect(staffLabel('Ann', 'institution_admin')).toBe('Ann (Admin)');
    const staff = teachingStaff([user('a', 'institution_admin', 'Ann'), user('b', 'senior_teacher', 'Bo')]);
    expect(staffNameById(staff)).toEqual({ a: 'Ann', b: 'Bo' }); // plain names, no tag
  });
});

describe('the pickers use the shared staff list', () => {
  const hook = lf(hookRaw);
  const subjectForm = lf(subjectFormRaw);
  const departmentForm = lf(departmentFormRaw);
  const departmentsList = lf(departmentsListRaw);

  it('the hook reads the shared cached users query, not a listener of its own', () => {
    expect(hook).toContain('useInstitutionUsers()');
    expect(hook).not.toContain('onSnapshot');
  });

  it('the Subject form lists senior and regular teachers and admins, and stores the plain name', () => {
    expect(subjectForm).toContain('useTeachingStaff()');
    expect(subjectForm).not.toContain("where('role', '==', 'regular_teacher')");
    expect(subjectForm).toContain('{teacher.label}');
    expect(subjectForm).toContain('toggleTeacher(teacher.id, teacher.name)');
  });

  it('the Department form and the departments list include admins', () => {
    expect(departmentForm).toContain('useTeachingStaff()');
    expect(departmentForm).toContain('{t.label}');
    expect(departmentForm).not.toContain('"senior_teacher", "regular_teacher"');
    expect(departmentsList).toContain('useTeachingStaff()');
    expect(departmentsList).toContain('staffNameById(staff)');
    expect(departmentsList).not.toContain('where("role", "in", ["senior_teacher", "regular_teacher"])');
  });

  it('the Assignment, Exam and Timetable forms also look up an institution admin teacher', () => {
    for (const src of [lf(assignmentFormRaw), lf(examFormRaw)]) {
      expect(src).toContain('"institution_admin"]');
      expect(src).toContain('"regular_teacher", "senior_teacher", "institution_admin"');
    }
    expect(lf(timetableFormRaw)).toContain("['regular_teacher', 'senior_teacher', 'institution_admin']");
  });

  it('the Assignment form accepts an institution admin as the teacher role (it refuses to save without one)', () => {
    const src = lf(assignmentFormRaw);
    expect(src).toContain('type AssignmentTeacherRole = "regular_teacher" | "senior_teacher" | "institution_admin";');
    expect(src).not.toContain('role?: "regular_teacher" | "senior_teacher"');
  });
});
