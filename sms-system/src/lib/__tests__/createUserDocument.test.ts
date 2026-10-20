import { describe, expect, it } from 'vitest';
import type { CreateUserFormValues } from '../createUserSchema';
import { accountInstitutionId, buildUserDocument } from '../createUserDocument';
import { normaliseMembership } from '../studentClasses';

// The shape of users/{uid} that the Create Account form writes for each role. Written when the builder
// was moved out of the component, so the move is pinned to what the form wrote before.

const values: CreateUserFormValues = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'Jane@Example.com',
  password: 'Passw0rdOk',
  confirmPassword: 'Passw0rdOk',
  phone: '',
  phone2: '',
  idNumber: '',
  role: 'parent',
  institutionId: 'inst1',
  departmentId: '',
  classId: '',
  assignedClassId: '',
  homeroomRoom: '',
  homeroomBuilding: '',
  dateOfBirth: '',
  institutionStudentId: '',
  gender: undefined,
};

const CREATED_AT = { sentinel: 'serverTimestamp' } as never; // stands in for serverTimestamp()
const classes = [
  { id: 'cls1', name: 'Grade 7A' },
  { id: 'cls2', name: 'Grade 7B' },
];

const build = (over: Partial<CreateUserFormValues>, membership = normaliseMembership({ classId: undefined, extraClassIds: [], classSubjects: {} })) =>
  buildUserDocument({
    uid: 'uid1',
    values: { ...values, ...over },
    email: 'jane@example.com',
    phone: '+18765551234',
    phone2: null,
    createdBy: 'admin1',
    createdAt: CREATED_AT,
    membership,
    classes,
  });

describe('buildUserDocument: every role', () => {
  it('writes the common profile, a forced password change and who created it', () => {
    expect(build({})).toEqual({
      uid: 'uid1',
      firstName: 'Jane',
      lastName: 'Doe',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+18765551234',
      phone2: null,
      idNumber: null,
      role: 'parent',
      institutionId: 'inst1',
      status: 'active',
      mustChangePassword: true,
      createdAt: CREATED_AT,
      createdBy: 'admin1',
    });
  });

  it('stores a blank ID number as null and a given one as typed', () => {
    expect(build({ idNumber: '' }).idNumber).toBeNull();
    expect(build({ idNumber: '123-456' }).idNumber).toBe('123-456');
  });

  it('stores a super admin under the "*" institution, whatever the form held', () => {
    expect(build({ role: 'super_admin', institutionId: '' }).institutionId).toBe('*');
    expect(build({ role: 'super_admin', institutionId: 'inst1' }).institutionId).toBe('*');
    expect(accountInstitutionId({ role: 'super_admin', institutionId: 'inst1' })).toBe('*');
    expect(accountInstitutionId({ role: 'student', institutionId: 'inst1' })).toBe('inst1');
  });

  it('adds nothing role-specific for a parent, spectator or administrator', () => {
    for (const role of ['parent', 'spectator', 'institution_admin', 'super_admin'] as const) {
      const doc = build({ role, classId: 'cls1', assignedClassId: 'cls1', departmentId: 'dep1', dateOfBirth: '2012-05-01', gender: 'Male' });
      expect(Object.keys(doc).sort()).toEqual(Object.keys(build({})).sort());
    }
  });
});

describe('buildUserDocument: student', () => {
  const student = { role: 'student' as const, dateOfBirth: '2012-05-01', gender: 'Female' as const, institutionStudentId: 'S-100' };

  it('writes date of birth, student ID and gender', () => {
    const doc = build(student);
    expect(doc).toMatchObject({ dateOfBirth: '2012-05-01', institutionStudentId: 'S-100', gender: 'Female' });
  });

  it('writes nulls for a student ID that was left blank and no class fields without a home class', () => {
    const doc = build({ ...student, institutionStudentId: '' });
    expect(doc).toMatchObject({ institutionStudentId: null });
    expect(doc).not.toHaveProperty('classId');
    expect(doc).not.toHaveProperty('classIds');
    expect(doc).not.toHaveProperty('classSubjects');
  });

  it('writes the home class, every class and the per-class subjects when a class is chosen', () => {
    const membership = normaliseMembership({ classId: 'cls1', extraClassIds: ['cls2'], classSubjects: { cls2: ['math'] } });
    const doc = build({ ...student, classId: 'cls1' }, membership);
    expect(doc).toMatchObject({ classId: 'cls1', classIds: ['cls1', 'cls2'], classSubjects: { cls2: ['math'] } });
  });
});

describe('buildUserDocument: teachers', () => {
  it('gives a senior teacher the homeroom class by name, with room and building', () => {
    const doc = build({ role: 'senior_teacher', assignedClassId: 'cls2', homeroomRoom: 'B4', homeroomBuilding: 'North' });
    expect(doc).toMatchObject({ assignedClassId: 'cls2', assignedClassName: 'Grade 7B', homeroomRoom: 'B4', homeroomBuilding: 'North' });
  });

  it('writes nulls for a senior teacher with no homeroom class, or a class the list does not know', () => {
    expect(build({ role: 'senior_teacher' })).toMatchObject({ assignedClassId: null, assignedClassName: null, homeroomRoom: null, homeroomBuilding: null });
    expect(build({ role: 'senior_teacher', assignedClassId: 'gone' })).toMatchObject({ assignedClassId: 'gone', assignedClassName: null });
  });

  it('gives a regular teacher no homeroom fields', () => {
    const doc = build({ role: 'regular_teacher', assignedClassId: 'cls1', homeroomRoom: 'B4' });
    expect(doc).not.toHaveProperty('assignedClassId');
    expect(doc).not.toHaveProperty('homeroomRoom');
  });

  it('writes the department for either teacher, only when one is chosen', () => {
    expect(build({ role: 'regular_teacher', departmentId: 'dep1' })).toMatchObject({ departmentId: 'dep1' });
    expect(build({ role: 'senior_teacher', departmentId: 'dep1' })).toMatchObject({ departmentId: 'dep1' });
    expect(build({ role: 'regular_teacher', departmentId: '' })).not.toHaveProperty('departmentId');
    expect(build({ role: 'student', departmentId: 'dep1' })).not.toHaveProperty('departmentId');
  });
});
