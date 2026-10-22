import { describe, expect, it } from 'vitest';
import { canManageExam, canViewExamContent } from '../examAccess';

// Who may open an online exam's builder and answer key (EXAMS_FEATURE_SPEC.md §11).

const exam = { teacherId: 'teacher1', departmentId: 'dept1' };

describe('canManageExam', () => {
  it('lets an administrator manage any exam', () => {
    expect(canManageExam(exam, { uid: 'a', role: 'institution_admin' })).toBe(true);
    expect(canManageExam(exam, { uid: 'a', role: 'super_admin' })).toBe(true);
  });

  it('lets a teacher manage only the exams they own', () => {
    expect(canManageExam(exam, { uid: 'teacher1', role: 'regular_teacher', departmentId: 'dept1' })).toBe(true);
    expect(canManageExam(exam, { uid: 'teacher2', role: 'regular_teacher', departmentId: 'dept1' })).toBe(false);
    expect(canManageExam(exam, { uid: 'teacher1', role: 'senior_teacher' })).toBe(true);
  });

  it('lets a senior teacher manage the exams of their own department only', () => {
    expect(canManageExam(exam, { uid: 's', role: 'senior_teacher', departmentId: 'dept1' })).toBe(true);
    expect(canManageExam(exam, { uid: 's', role: 'senior_teacher', departmentId: 'dept2' })).toBe(false);
    expect(canManageExam(exam, { uid: 's', role: 'senior_teacher', departmentId: null })).toBe(false);
    expect(canManageExam({ teacherId: 'teacher1' }, { uid: 's', role: 'senior_teacher', departmentId: 'dept1' })).toBe(false);
  });

  it('never lets a regular teacher in through a department', () => {
    expect(canManageExam(exam, { uid: 'r', role: 'regular_teacher', departmentId: 'dept1' })).toBe(false);
  });

  it('refuses students, parents, spectators and a missing role', () => {
    for (const role of ['student', 'parent', 'spectator', null, undefined] as const) {
      expect(canManageExam(exam, { uid: 'teacher1', role, departmentId: 'dept1' })).toBe(false);
    }
  });
});

describe('canViewExamContent', () => {
  it('adds the spectator, who can read but not change', () => {
    expect(canViewExamContent(exam, { uid: 'x', role: 'spectator' })).toBe(true);
    expect(canViewExamContent(exam, { uid: 'x', role: 'student' })).toBe(false);
    expect(canViewExamContent(exam, { uid: 'teacher1', role: 'regular_teacher' })).toBe(true);
    expect(canViewExamContent(exam, { uid: 'teacher2', role: 'regular_teacher' })).toBe(false);
  });
});
