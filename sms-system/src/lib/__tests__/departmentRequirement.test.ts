import { describe, it, expect } from 'vitest';
import { departmentRequired, isDepartmentMissing, isTeacherRole } from '../departmentRequirement';

describe('isTeacherRole', () => {
  it('is true for both teacher roles only', () => {
    expect(isTeacherRole('regular_teacher')).toBe(true);
    expect(isTeacherRole('senior_teacher')).toBe(true);
    for (const r of ['student', 'parent', 'institution_admin', 'super_admin', '', null, undefined]) {
      expect(isTeacherRole(r)).toBe(false);
    }
  });
});

describe('departmentRequired', () => {
  it('requires a department for teachers when the institution has departments', () => {
    expect(departmentRequired('regular_teacher', true)).toBe(true);
    expect(departmentRequired('senior_teacher', true)).toBe(true);
  });

  it('does not require one when the institution has no departments', () => {
    expect(departmentRequired('regular_teacher', false)).toBe(false);
    expect(departmentRequired('senior_teacher', false)).toBe(false);
  });

  it('never requires one for non-teacher roles', () => {
    expect(departmentRequired('student', true)).toBe(false);
    expect(departmentRequired('parent', true)).toBe(false);
    expect(departmentRequired('institution_admin', true)).toBe(false);
    expect(departmentRequired(null, true)).toBe(false);
  });
});

describe('isDepartmentMissing', () => {
  it('treats absent, null and empty-string departmentId as missing', () => {
    expect(isDepartmentMissing('regular_teacher', undefined, true)).toBe(true);
    expect(isDepartmentMissing('regular_teacher', null, true)).toBe(true);
    expect(isDepartmentMissing('regular_teacher', '', true)).toBe(true);
  });

  it('is not missing when a department is set', () => {
    expect(isDepartmentMissing('regular_teacher', 'dept-1', true)).toBe(false);
  });

  it('is never missing where it is not required', () => {
    expect(isDepartmentMissing('regular_teacher', undefined, false)).toBe(false);
    expect(isDepartmentMissing('student', undefined, true)).toBe(false);
  });
});
