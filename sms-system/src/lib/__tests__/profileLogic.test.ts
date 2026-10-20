import { describe, expect, it } from 'vitest';
import type { Role } from '../firebase';
import {
  buildProfileByRole,
  buildRoleDetails,
  contactSchema,
  displayStatus,
  fmtDate,
  fmtDateTime,
  mockActivityFor,
  parentRecordFor,
  studentRecordFor,
  teacherRecordFor,
  toFormValue,
  type AuthProfileValues,
} from '../profileLogic';

// The profile page's rules that need no screen or database. Written when they were moved out of the page, so
// the move is pinned to what the page did.

const ROLES: Role[] = ['super_admin', 'institution_admin', 'spectator', 'regular_teacher', 'senior_teacher', 'student', 'parent'];

const auth: AuthProfileValues = {
  uid: 'u1',
  email: 'ann@example.com',
  authDisplayName: 'Ann (Firebase)',
  displayName: 'Ann Lee',
  phone: '+1-876-555-0100',
  address: '1 Test Road',
  department: 'Science',
  emergencyContact: 'Bob - 555',
  linkedAccounts: 'Google',
  photoUrl: 'https://img/ann.png',
  userStatus: 'active',
};

const blank: AuthProfileValues = {
  uid: undefined,
  email: undefined,
  authDisplayName: undefined,
  displayName: null,
  phone: null,
  address: null,
  department: null,
  emergencyContact: null,
  linkedAccounts: null,
  photoUrl: null,
  userStatus: null,
};

describe('contactSchema and toFormValue', () => {
  it('wants a name of at least 2 characters and treats phone and emergency contact as optional', () => {
    expect(contactSchema.safeParse({ name: 'Al' }).success).toBe(true);
    const bad = contactSchema.safeParse({ name: 'A' });
    expect(bad.success ? [] : bad.error.issues.map((i) => i.message)).toEqual(['Name must be at least 2 characters']);
    expect(contactSchema.safeParse({ name: 'Al', phone: '', emergencyContact: '' }).success).toBe(true);
  });

  it('turns the page’s "—" placeholder into an empty field', () => {
    expect(toFormValue('—')).toBe('');
    expect(toFormValue('555-0001')).toBe('555-0001');
  });
});

describe('displayStatus, fmtDate and fmtDateTime', () => {
  it('capitalises a status and shows "—" for none', () => {
    expect(displayStatus('active')).toBe('Active');
    expect(displayStatus('Disabled')).toBe('Disabled');
    expect(displayStatus(null)).toBe('—');
    expect(displayStatus(undefined)).toBe('—');
    expect(displayStatus('')).toBe('—');
  });

  it('shows a date as "Mon DD, YYYY" and "—" when there is none', () => {
    expect(fmtDate('2026-03-05T12:00:00Z')).toBe('Mar 05, 2026');
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(undefined)).toBe('—');
  });

  it('shows a date and time joined by " - ", and "—" when there is none', () => {
    expect(fmtDateTime('2026-03-05T12:00:00Z')).toMatch(/^Mar 0[45], 2026 - \d{2}:\d{2}/);
    expect(fmtDateTime(null)).toBe('—');
  });
});

describe('the records shown for a teacher, a student and a parent', () => {
  it('builds the teacher from the account when there is no mock record', () => {
    expect(teacherRecordFor(undefined, auth)).toEqual({
      name: 'Ann Lee',
      email: 'ann@example.com',
      phone: '+1-876-555-0100',
      photo: 'https://img/ann.png',
      teacherId: 'u1',
      subjects: [],
      classes: [],
      address: '1 Test Road',
      department: 'Science',
      emergencyContact: 'Bob - 555',
      schedule: '—',
      metrics: '—',
      status: 'Active',
      linkedAccounts: 'Google',
    });
  });

  it('builds the student and the parent from the account too', () => {
    expect(studentRecordFor(undefined, auth)).toMatchObject({ name: 'Ann Lee', studentId: 'u1', grade: 0, class: '—', homeroom: '—', guardians: [], gpa: '—', status: 'Active' });
    expect(parentRecordFor(undefined, auth)).toMatchObject({ name: 'Ann Lee', parentId: 'u1', students: [], relationship: '—', childAttendance: '—', status: 'Active' });
  });

  it('shows "—" and the default avatar for everything an account lacks', () => {
    expect(teacherRecordFor(undefined, blank)).toMatchObject({ name: '—', email: '—', phone: '—', photo: '/avatar.png', teacherId: '—', address: '—', department: '—', emergencyContact: '—', status: '—', linkedAccounts: '—' });
    expect(studentRecordFor(undefined, blank)).toMatchObject({ studentId: '—', photo: '/avatar.png', status: '—' });
    expect(parentRecordFor(undefined, blank)).toMatchObject({ parentId: '—', photo: '/avatar.png', status: '—' });
  });

  it('uses the mock record when there is one', () => {
    const mock = { name: 'Mock Teacher' } as unknown as Parameters<typeof teacherRecordFor>[0];
    expect(teacherRecordFor(mock, auth)).toBe(mock);
  });
});

describe('buildProfileByRole', () => {
  const build = (a: AuthProfileValues, useMock: boolean) =>
    buildProfileByRole({
      a,
      teacher: teacherRecordFor(undefined, a),
      student: studentRecordFor(undefined, a),
      parent: parentRecordFor(undefined, a),
      createdAt: 'Jan 01, 2026',
      lastLogin: 'Mar 05, 2026 - 10:00 AM',
      useMock,
    });

  it('has an entry for every role, each carrying the dates it was given', () => {
    const profiles = build(auth, false);
    expect(Object.keys(profiles).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      expect(profiles[role].createdAt, role).toBe('Jan 01, 2026');
      expect(profiles[role].lastLogin, role).toBe('Mar 05, 2026 - 10:00 AM');
    }
  });

  it('shows the account’s own values for the admin roles when live', () => {
    const p = build(auth, false);
    for (const role of ['institution_admin', 'spectator'] as const) {
      expect(p[role], role).toMatchObject({
        name: 'Ann Lee',
        email: 'ann@example.com',
        phone: '+1-876-555-0100',
        userId: 'u1',
        status: 'Active',
        linkedAccounts: 'Google',
        emergencyContact: 'Bob - 555',
        address: '1 Test Road',
        timezone: 'America/Chicago',
      });
    }
  });

  it('shows the sample text for the admin roles in mock mode, and a platform account for the super admin', () => {
    const p = build(auth, true);
    expect(p.institution_admin).toMatchObject({ phone: '555-0001', linkedAccounts: 'Google Workspace, Microsoft 365', emergencyContact: 'Sarah Doe - 555-0051', address: '123 Main St, Anytown, USA' });
    expect(p.spectator).toEqual({ ...p.institution_admin });
    expect(p.super_admin.linkedAccounts).toBe('Platform Dashboard');
  });

  it('gives the super admin no phone, address or emergency contact and the UTC time zone', () => {
    expect(build(auth, false).super_admin).toMatchObject({ phone: '—', address: '—', emergencyContact: '—', timezone: 'UTC', linkedAccounts: 'Google' });
  });

  it('falls back to the Firebase display name, then "—"', () => {
    expect(build({ ...auth, displayName: null }, false).super_admin.name).toBe('Ann (Firebase)');
    expect(build({ ...auth, displayName: null, authDisplayName: null }, false).institution_admin.name).toBe('—');
  });

  it('shows the teacher, student and parent records for their roles', () => {
    const p = build(auth, false);
    expect(p.regular_teacher).toEqual(p.senior_teacher);
    expect(p.regular_teacher).toMatchObject({ name: 'Ann Lee', userId: 'u1', phone: '+1-876-555-0100', status: 'Active' });
    expect(p.student).toMatchObject({ name: 'Ann Lee', userId: 'u1', emergencyContact: 'Bob - 555' });
    expect(p.parent).toMatchObject({ name: 'Ann Lee', userId: 'u1', address: '1 Test Road' });
  });

  it('uses the account’s uid for the id when the record has none, and the record’s own id when it has one', () => {
    const p = build(blank, false);
    expect(p.regular_teacher.userId).toBe('—');
    const mock = { teacherId: 'T-9', name: 'M' } as unknown as Parameters<typeof teacherRecordFor>[0];
    const withMock = buildProfileByRole({
      a: auth,
      teacher: teacherRecordFor(mock, auth),
      student: studentRecordFor(undefined, auth),
      parent: parentRecordFor(undefined, auth),
      createdAt: 'x',
      lastLogin: 'y',
      useMock: false,
    });
    expect(withMock.regular_teacher.userId).toBe('T-9');
  });
});

describe('the roles that are shown the same fields', () => {
  // The profile builder writes the administrator's and the spectator's fields once, and the teacher, student and parent
  // through one function; these pin that each role still gets its own copy and that the pairs match.
  const profiles = (useMock: boolean) =>
    buildProfileByRole({
      a: auth,
      teacher: teacherRecordFor(undefined, auth),
      student: studentRecordFor(undefined, auth),
      parent: parentRecordFor(undefined, auth),
      createdAt: 'Jan 01, 2026',
      lastLogin: 'Mar 05, 2026 - 10:00 AM',
      useMock,
    });

  it('gives the spectator the administrator’s fields, in an object of its own', () => {
    for (const useMock of [false, true]) {
      const p = profiles(useMock);
      expect(p.spectator).toEqual(p.institution_admin);
      expect(p.spectator).not.toBe(p.institution_admin);
    }
  });

  it('gives the senior teacher the regular teacher’s fields, in an object of its own', () => {
    const p = profiles(false);
    expect(p.senior_teacher).toEqual(p.regular_teacher);
    expect(p.senior_teacher).not.toBe(p.regular_teacher);
  });

  it('lists a field in the same order for every role', () => {
    const p = profiles(false);
    const keys = Object.keys(p.parent);
    for (const role of ROLES.filter((r) => r !== 'super_admin')) expect(Object.keys(p[role]), role).toEqual(keys);
  });

  it('gives the senior teacher the regular teacher’s detail rows plus Department Head after Department', () => {
    const d = buildRoleDetails({
      teacher: teacherRecordFor(undefined, auth),
      student: studentRecordFor(undefined, auth),
      parent: parentRecordFor(undefined, auth),
      authDepartment: null,
      useMock: false,
    });
    expect(d.senior_teacher.filter((r) => r.label !== 'Department Head')).toEqual(d.regular_teacher);
    expect(d.senior_teacher.map((r) => r.label).indexOf('Department Head')).toBe(2);
    expect(d.senior_teacher).not.toBe(d.regular_teacher);
  });
});

describe('buildRoleDetails', () => {
  const details = (a: AuthProfileValues, useMock = false) =>
    buildRoleDetails({
      teacher: teacherRecordFor(undefined, a),
      student: studentRecordFor(undefined, a),
      parent: parentRecordFor(undefined, a),
      authDepartment: a.department,
      useMock,
    });
  const labels = (rows: { label: string }[]) => rows.map((r) => r.label);

  it('has rows for every role', () => {
    const d = details(auth);
    expect(Object.keys(d).sort()).toEqual([...ROLES].sort());
    expect(labels(d.super_admin)).toEqual(['Access level', 'Institutions managed', 'Permissions']);
    expect(labels(d.institution_admin)).toEqual(['Department', 'Permissions']);
    expect(labels(d.spectator)).toEqual(['Access level', 'Permissions']);
    expect(labels(d.regular_teacher)).toEqual(['Employee ID', 'Department', 'Subjects', 'Assigned classes', 'Schedule', 'Metrics']);
    expect(labels(d.senior_teacher)).toEqual(['Employee ID', 'Department', 'Department Head', 'Subjects', 'Assigned classes', 'Schedule', 'Metrics']);
    expect(labels(d.student)).toEqual(['Student ID', 'Grade and class', 'Homeroom', 'Guardians', 'Attendance summary', 'GPA / grades']);
    expect(labels(d.parent)).toEqual(['Linked students', 'Relationship', 'Student performance', 'Attendance']);
  });

  it('takes the admin’s department from the account, or the sample one in mock mode', () => {
    expect(details(auth).institution_admin[0].value).toBe('Science');
    expect(details(blank).institution_admin[0].value).toBe('—');
    expect(details(auth, true).institution_admin[0].value).toBe('Operations');
  });

  it('shows the teacher’s id and department and "—" for empty lists', () => {
    const rows = details(auth).regular_teacher;
    expect(rows.find((r) => r.label === 'Employee ID')?.value).toBe('u1');
    expect(rows.find((r) => r.label === 'Department')?.value).toBe('Science');
    expect(rows.find((r) => r.label === 'Subjects')?.value).toBe('—');
    expect(rows.find((r) => r.label === 'Assigned classes')?.value).toBe('—');
    expect(details(auth).senior_teacher.find((r) => r.label === 'Department Head')?.value).toBe('Yes');
  });

  it('shows the grade and class only when the student has a grade, and joins guardians and linked students', () => {
    expect(details(auth).student.find((r) => r.label === 'Grade and class')?.value).toBe('—');
    const student = { ...studentRecordFor(undefined, auth), grade: 7, class: '7A', guardians: ['Mum', 'Dad'] };
    const parent = { ...parentRecordFor(undefined, auth), students: ['Sam', 'Kim'] };
    const d = buildRoleDetails({ teacher: teacherRecordFor(undefined, auth), student, parent, authDepartment: null, useMock: false });
    expect(d.student.find((r) => r.label === 'Grade and class')?.value).toBe('Grade 7 - 7A');
    expect(d.student.find((r) => r.label === 'Guardians')?.value).toBe('Mum, Dad');
    expect(d.parent.find((r) => r.label === 'Linked students')?.value).toBe('Sam, Kim');
  });
});

describe('mockActivityFor', () => {
  const log = [{ eventType: 'profile_update', detail: 'x', timestamp: 't', uid: 'u1', institutionId: '' }] as unknown as Parameters<typeof mockActivityFor>[0]['activityLog'];
  const user = { uid: 'u1', metadata: { lastSignInTime: 'Wed, 04 Mar 2026 10:00:00 GMT' } } as unknown as Parameters<typeof mockActivityFor>[0]['user'];

  it('is empty when not in mock mode', () => {
    expect(mockActivityFor({ useMock: false, user, activityLog: log })).toEqual([]);
  });

  it('starts with a sign-in entry for the current session, then the sample log', () => {
    const out = mockActivityFor({ useMock: true, user, activityLog: log });
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ eventType: 'sign_in', detail: 'Chrome on Windows', timestamp: 'Wed, 04 Mar 2026 10:00:00 GMT', uid: 'u1', institutionId: '' });
    expect(out[1]).toBe(log[0]);
  });

  it('is only the sample log when there is no sign-in time', () => {
    expect(mockActivityFor({ useMock: true, user: null, activityLog: log })).toEqual(log);
    const noTime = { uid: 'u1', metadata: {} } as unknown as Parameters<typeof mockActivityFor>[0]['user'];
    expect(mockActivityFor({ useMock: true, user: noTime, activityLog: log })).toEqual(log);
  });
});
