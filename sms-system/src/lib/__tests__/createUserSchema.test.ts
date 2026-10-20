import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import { createUserSchema, getFirebaseMessage, type CreateUserFormValues } from '../createUserSchema';

// What the Create Account form (AdminCreateUserForm.tsx) accepts and says. Written when the schema was
// moved out of the component, so the move is pinned to the behaviour it had.

const base: CreateUserFormValues = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  password: 'Passw0rdOk',
  confirmPassword: 'Passw0rdOk',
  phone: '',
  phone2: '',
  idNumber: '',
  role: 'regular_teacher',
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

const issues = (values: Partial<CreateUserFormValues>) => {
  const result = createUserSchema.safeParse({ ...base, ...values });
  return result.success ? [] : result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
};
const messageAt = (values: Partial<CreateUserFormValues>, path: string) => issues(values).find((i) => i.path === path)?.message;

describe('createUserSchema: any role', () => {
  it('accepts a complete teacher', () => {
    expect(issues({})).toEqual([]);
  });

  it('wants names of 2 to 50 letters, spaces, apostrophes or hyphens', () => {
    expect(messageAt({ firstName: 'J' }, 'firstName')).toBe('First name must be at least 2 characters.');
    expect(messageAt({ firstName: 'J'.repeat(51) }, 'firstName')).toBe('First name must be 50 characters or less.');
    expect(messageAt({ lastName: 'Doe3' }, 'lastName')).toBe('Use letters, spaces, apostrophes, or hyphens only.');
    expect(messageAt({ lastName: "O'Neil-Smith" }, 'lastName')).toBeUndefined();
    expect(messageAt({ firstName: '  Jo  ' }, 'firstName')).toBeUndefined(); // trimmed first
  });

  it('wants an email address', () => {
    expect(messageAt({ email: '' }, 'email')).toBe('Email is required.');
    expect(messageAt({ email: 'not-an-email' }, 'email')).toBe('Enter a valid email address.');
    expect(messageAt({ email: `${'a'.repeat(250)}@x.co` }, 'email')).toBe('Email must be 254 characters or less.');
  });

  it('holds the temporary password to 8 to 64 characters with a lowercase letter, a capital and a number', () => {
    const at = (password: string) => messageAt({ password, confirmPassword: password }, 'password');
    expect(at('Ab1')).toBe('Password must be at least 8 characters.');
    expect(at('Abcdefg1'.padEnd(65, 'x'))).toBe('Password must be 64 characters or less.');
    expect(at('PASSWORD1')).toBe('Password needs at least one lowercase letter.');
    expect(at('password1')).toBe('Password needs at least one uppercase letter.');
    expect(at('Passwordx')).toBe('Password needs at least one number.');
    expect(at('Passw0rdOk')).toBeUndefined();
  });

  it('wants the confirmation filled in and equal to the password', () => {
    expect(messageAt({ confirmPassword: '' }, 'confirmPassword')).toBe('Confirm the temporary password.');
    expect(messageAt({ confirmPassword: 'Different1' }, 'confirmPassword')).toBe('Passwords do not match.');
  });

  it('accepts a blank phone and refuses a malformed one, on both phone fields', () => {
    expect(messageAt({ phone: '' }, 'phone')).toBeUndefined();
    expect(messageAt({ phone: '(876) 555-1234' }, 'phone')).toBeUndefined();
    expect(messageAt({ phone: '12' }, 'phone')).toBe('Enter a valid phone number.');
    expect(messageAt({ phone2: 'abc' }, 'phone2')).toBe('Enter a valid phone number.');
  });

  it('limits the citizen ID or TRN to 50 characters', () => {
    expect(messageAt({ idNumber: 'x'.repeat(51) }, 'idNumber')).toBe('Citizen ID or TRN must be 50 characters or less.');
    expect(messageAt({ idNumber: 'x'.repeat(50) }, 'idNumber')).toBeUndefined();
  });

  it('accepts exactly the seven roles', () => {
    for (const role of ['institution_admin', 'senior_teacher', 'regular_teacher', 'student', 'parent', 'super_admin', 'spectator'] as const) {
      expect(issues({ role, dateOfBirth: '2010-01-01', gender: 'Male' }).filter((i) => i.path === 'role')).toEqual([]);
    }
    expect(issues({ role: 'owner' as never }).some((i) => i.path === 'role')).toBe(true);
  });
});

describe('createUserSchema: institution', () => {
  it('is required for every role except a super admin', () => {
    expect(messageAt({ institutionId: '' }, 'institutionId')).toBe('Institution is required for this role.');
    expect(messageAt({ role: 'institution_admin', institutionId: '' }, 'institutionId')).toBe('Institution is required for this role.');
    expect(messageAt({ role: 'super_admin', institutionId: '' }, 'institutionId')).toBeUndefined();
  });
});

describe('createUserSchema: senior teacher homeroom', () => {
  it('wants a room once a homeroom class is chosen, and only for a senior teacher', () => {
    const senior = { role: 'senior_teacher' as const, assignedClassId: 'cls1' };
    expect(messageAt({ ...senior, homeroomRoom: '' }, 'homeroomRoom')).toBe('Room is required when a homeroom class is assigned.');
    expect(messageAt({ ...senior, homeroomRoom: '   ' }, 'homeroomRoom')).toBe('Room is required when a homeroom class is assigned.');
    expect(messageAt({ ...senior, homeroomRoom: 'B4' }, 'homeroomRoom')).toBeUndefined();
    expect(messageAt({ role: 'senior_teacher', assignedClassId: '', homeroomRoom: '' }, 'homeroomRoom')).toBeUndefined();
    expect(messageAt({ role: 'regular_teacher', assignedClassId: 'cls1', homeroomRoom: '' }, 'homeroomRoom')).toBeUndefined();
  });

  it('limits room and building to 50 characters', () => {
    expect(messageAt({ homeroomRoom: 'r'.repeat(51) }, 'homeroomRoom')).toBe('Room must be 50 characters or less.');
    expect(messageAt({ homeroomBuilding: 'b'.repeat(51) }, 'homeroomBuilding')).toBe('Building must be 50 characters or less.');
  });
});

describe('createUserSchema: student', () => {
  const student = { role: 'student' as const, dateOfBirth: '2012-05-01', gender: 'Female' as const };

  it('accepts a student with a date of birth and a gender', () => {
    expect(issues(student)).toEqual([]);
  });

  it('wants a real date of birth', () => {
    expect(messageAt({ ...student, dateOfBirth: '' }, 'dateOfBirth')).toBe('Date of birth is required.');
    expect(messageAt({ ...student, dateOfBirth: '01/05/2012' }, 'dateOfBirth')).toBe('Date of birth is required.');
    expect(messageAt({ ...student, dateOfBirth: '2012-13-45' }, 'dateOfBirth')).toBe('Date of birth is required.');
  });

  it('wants the student to be at least 3 years old', () => {
    const now = new Date();
    const years = (n: number, extraDays = 0) => {
      const d = new Date(Date.UTC(now.getUTCFullYear() - n, now.getUTCMonth(), now.getUTCDate() + extraDays, 12));
      return d.toISOString().slice(0, 10);
    };
    expect(messageAt({ ...student, dateOfBirth: years(3) }, 'dateOfBirth')).toBeUndefined(); // turns 3 today
    expect(messageAt({ ...student, dateOfBirth: years(3, 2) }, 'dateOfBirth')).toBe('Student must be at least 3 years old.');
    expect(messageAt({ ...student, dateOfBirth: years(1) }, 'dateOfBirth')).toBe('Student must be at least 3 years old.');
  });

  it('wants a gender, Male or Female', () => {
    expect(messageAt({ ...student, gender: undefined }, 'gender')).toBe('Gender is required.');
    expect(messageAt({ ...student, gender: 'Other' as never }, 'gender')).toBe('Please select a gender.');
  });

  it('does not ask a non-student for either', () => {
    expect(issues({ role: 'parent', dateOfBirth: '', gender: undefined })).toEqual([]);
  });
});

describe('getFirebaseMessage', () => {
  it('has plain wording for the errors an admin can cause', () => {
    const code = (c: string) => getFirebaseMessage(new FirebaseError(c, 'raw'));
    expect(code('auth/email-already-in-use')).toBe('That email already belongs to another account.');
    expect(code('auth/invalid-email')).toBe('Enter a valid email address.');
    expect(code('auth/weak-password')).toBe('Password should be at least 8 characters.');
    expect(code('auth/network-request-failed')).toBe('Network error. Check your connection and try again.');
    expect(code('permission-denied')).toBe('Firestore denied this write. Check your security rules for admin user creation.');
  });

  it("shows Firebase's own message for a code it does not know, and a generic one for anything else", () => {
    expect(getFirebaseMessage(new FirebaseError('auth/something-new', 'Something new happened'))).toBe('Something new happened');
    expect(getFirebaseMessage(new Error('boom'))).toBe('Something went wrong while creating the user.');
    expect(getFirebaseMessage('boom')).toBe('Something went wrong while creating the user.');
  });
});
