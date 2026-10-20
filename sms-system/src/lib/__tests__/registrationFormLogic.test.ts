import { describe, expect, it } from 'vitest';
import {
  buildRegistrationDocument,
  buildSchema,
  capitalizeWords,
  isCustomModeOf,
  meetsMinimumAge,
  resolveProgramme,
  type RegistrationDirectory,
} from '../registrationFormLogic';

// The public registration form's rules that need no screen or database. Written when they were moved out of the
// page, so the move is pinned to what the page did. Nothing reads that page as text, so these are its main guard.

const guardian = {
  lastName: 'Smith-Jones',
  firstName: 'Rose',
  address: '1 Test Road',
  contact: '876 555 9999',
  email: 'Rose@Example.com',
  occupation: 'Nurse',
  work: '',
};

const valid = {
  academicYearId: '',
  student: {
    lastName: "O'Brien",
    firstName: 'Anne',
    middleName: '',
    requestedClass: 'Grade 7',
    dateOfBirth: '2010-05-15',
    gender: 'Female',
    email: 'Anne@Example.com',
    lastSchoolAttended: '',
    phone: '',
    phone2: '',
    citizenId: '',
  },
  includeMother: true,
  includeFather: false,
  mother: guardian,
};

const issues = (isCustomMode: boolean, over: Record<string, unknown> = {}, student: Record<string, unknown> = {}) => {
  const result = buildSchema(isCustomMode).safeParse({ ...valid, ...over, student: { ...valid.student, ...student } });
  if (result.success) return [];
  // the form shows one message per field (the first), so that is what is listed here
  const seen = new Set<string>();
  return result.error.issues
    .filter((i) => !seen.has(i.path.join('.')) && !!seen.add(i.path.join('.')))
    .map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('meetsMinimumAge', () => {
  const now = new Date('2026-10-18T12:00:00');

  it('is false for anything that is not a yyyy-mm-dd date', () => {
    expect(meetsMinimumAge('', now)).toBe(false);
    expect(meetsMinimumAge('15/05/2010', now)).toBe(false);
    expect(meetsMinimumAge('2010-5-15', now)).toBe(false);
    expect(meetsMinimumAge('2010-13-45', now)).toBe(false);
  });

  it('is true from the tenth birthday on, and false the day before', () => {
    expect(meetsMinimumAge('2016-10-18', now)).toBe(true);
    expect(meetsMinimumAge('2016-10-19', now)).toBe(false);
    expect(meetsMinimumAge('2010-05-15', now)).toBe(true);
  });

  it('is false for a younger child and for a date in the future', () => {
    expect(meetsMinimumAge('2017-01-01', now)).toBe(false);
    expect(meetsMinimumAge('2030-01-01', now)).toBe(false);
  });

  it('uses today when no date is given', () => {
    expect(meetsMinimumAge('2000-01-01')).toBe(true);
    expect(meetsMinimumAge(new Date().toISOString().slice(0, 10))).toBe(false);
  });
});

describe('capitalizeWords: accented letters', () => {
  // The rule used to be \b\p{L}, and \b is ASCII-only: an accented letter counted as a word boundary, so "zoë"
  // became "ZoË" and "émile" became "éMile".
  it('capitalises an accented letter at the start of a word, and not one inside it', () => {
    expect(capitalizeWords('zoë zola')).toBe('Zoë Zola');
    expect(capitalizeWords('émile zola')).toBe('Émile Zola');
    expect(capitalizeWords('josé de la rosa')).toBe('José De La Rosa');
    expect(capitalizeWords('çelik-öztürk')).toBe('Çelik-Öztürk');
  });

  it('does not capitalise the letter after an accent written as a separate combining mark', () => {
    expect(capitalizeWords('émile')).toBe('Émile');
  });

  it('works for letters outside the Latin alphabet', () => {
    expect(capitalizeWords('μαρία παπά')).toBe('Μαρία Παπά');
  });
});

describe('capitalizeWords', () => {
  it('capitalizes the letter after a space, hyphen or apostrophe', () => {
    expect(capitalizeWords('anne marie')).toBe('Anne Marie');
    expect(capitalizeWords('mary-jane')).toBe('Mary-Jane');
    expect(capitalizeWords("o'brien")).toBe("O'Brien");
  });

  it('keeps capitalising after an apostrophe of either kind, and not after a digit or an underscore', () => {
    expect(capitalizeWords('o’brien')).toBe('O’Brien');
    expect(capitalizeWords('anne2marie')).toBe('Anne2marie');
    expect(capitalizeWords('anne_marie')).toBe('Anne_marie');
    expect(capitalizeWords('  anne   marie ')).toBe('  Anne   Marie ');
  });

  it('leaves later capitals alone', () => {
    expect(capitalizeWords('mcDonald')).toBe('McDonald');
    expect(capitalizeWords('mcdonald')).toBe('Mcdonald');
    expect(capitalizeWords('')).toBe('');
  });
});

describe('the registration schema: the student', () => {
  it('accepts a complete registration', () => {
    expect(issues(false)).toEqual([]);
  });

  it('asks for the names, class, date of birth, gender and email', () => {
    expect(
      issues(false, {}, { lastName: '', firstName: '', requestedClass: '', dateOfBirth: '', gender: undefined, email: '' }),
    ).toEqual([
      'student.lastName: Last name is required.',
      'student.firstName: First name is required.',
      'student.requestedClass: Requested class/grade is required.',
      'student.dateOfBirth: Date of birth is required.',
      'student.gender: Please select a gender.',
      'student.email: Email is required.',
    ]);
  });

  it('accepts letters, spaces, apostrophes and hyphens in a name, and nothing else', () => {
    expect(issues(false, {}, { firstName: 'Anne 2' })).toEqual(['student.firstName: Use letters, spaces, apostrophes, or hyphens only.']);
    expect(issues(false, {}, { middleName: 'De La Cruz' })).toEqual([]);
    expect(issues(false, {}, { middleName: 'X1' })).toEqual(['student.middleName: Use letters, spaces, apostrophes, or hyphens only.']);
    expect(issues(false, {}, { firstName: 'x'.repeat(101) })).toEqual(['student.firstName: First name must be 100 characters or less.']);
  });

  it('trims what is typed before checking it', () => {
    expect(issues(false, {}, { lastName: '   ' })).toEqual(['student.lastName: Last name is required.']);
  });

  it('refuses angle brackets and control characters in the free-text fields', () => {
    const message = "Contains characters that aren't allowed.";
    expect(issues(false, {}, { requestedClass: '<b>Grade 7</b>' })).toEqual([`student.requestedClass: ${message}`]);
    expect(issues(false, {}, { lastSchoolAttended: 'Bad\u0007School' })).toEqual([`student.lastSchoolAttended: ${message}`]);
    expect(issues(false, {}, { citizenId: 'a>b' })).toEqual([`student.citizenId: ${message}`]);
    expect(issues(false, {}, { requestedClass: 'Grade 7 & 8' })).toEqual([]);
  });

  it('limits the free-text fields', () => {
    expect(issues(false, {}, { requestedClass: 'x'.repeat(51) })).toEqual(['student.requestedClass: Requested class/grade must be 50 characters or less.']);
    expect(issues(false, {}, { lastSchoolAttended: 'x'.repeat(201) })).toEqual(['student.lastSchoolAttended: Last school attended must be 200 characters or less.']);
    expect(issues(false, {}, { citizenId: 'x'.repeat(51) })).toEqual(['student.citizenId: Citizen ID or TRN must be 50 characters or less.']);
  });

  it('wants a student at least ten years old', () => {
    expect(issues(false, {}, { dateOfBirth: '2024-01-01' })).toEqual(['student.dateOfBirth: Student must be at least 10 years old.']);
  });

  it('wants Male or Female', () => {
    expect(issues(false, {}, { gender: 'Other' })).toEqual(['student.gender: Please select a gender.']);
    expect(issues(false, {}, { gender: 'Male' })).toEqual([]);
  });

  it('checks the email and the optional phones', () => {
    expect(issues(false, {}, { email: 'not-an-email' })).toEqual(['student.email: Enter a valid email address.']);
    expect(issues(false, {}, { phone: '12' })).toEqual(['student.phone: Enter a valid phone number.']);
    expect(issues(false, {}, { phone2: 'abc' })).toEqual(['student.phone2: Enter a valid phone number.']);
    expect(issues(false, {}, { phone: '876 555 1234', phone2: '+1 (876) 555-1234' })).toEqual([]);
  });
});

describe('the registration schema: the parents', () => {
  it('wants at least one parent in an academic-year institution', () => {
    expect(issues(false, { includeMother: false, mother: undefined })).toEqual([
      "includeMother: Provide at least one parent/guardian's information.",
    ]);
    expect(issues(false, { includeMother: false, mother: undefined, includeFather: true, father: guardian })).toEqual([]);
  });

  it('wants none in a custom-mode institution', () => {
    expect(issues(true, { academicYearId: 'y1', includeMother: false, mother: undefined })).toEqual([]);
  });

  it('wants the details of a parent who is ticked', () => {
    expect(issues(false, { mother: undefined })).toEqual(["mother: Mother's information is required."]);
    expect(issues(false, { includeFather: true, father: undefined })).toEqual(["father: Father's information is required."]);
  });

  it('checks a ticked parent’s fields', () => {
    expect(
      issues(false, { mother: { ...guardian, lastName: '', firstName: '', address: '', contact: '', email: '', occupation: '' } }),
    ).toEqual([
      'mother.lastName: Last name is required.',
      'mother.firstName: First name is required.',
      'mother.address: Address is required.',
      'mother.contact: Contact number is required.',
      'mother.email: Email is required.',
      'mother.occupation: Occupation is required.',
    ]);
    expect(issues(false, { mother: { ...guardian, contact: '12', email: 'bad' } })).toEqual([
      'mother.contact: Enter a valid phone number.',
      'mother.email: Enter a valid email address.',
    ]);
    expect(issues(false, { mother: { ...guardian, address: '<script>' } })).toEqual(["mother.address: Contains characters that aren't allowed."]);
    expect(issues(false, { mother: { ...guardian, work: 'x'.repeat(101) } })).toEqual(['mother.work: Employer must be 100 characters or less.']);
  });

  it('does not look for the details of a parent who is not ticked (their fields are not on the form)', () => {
    expect(issues(false, { includeFather: false, father: undefined })).toEqual([]);
  });
});

describe('the registration schema: the programme', () => {
  it('wants a programme in custom mode only', () => {
    expect(issues(true, { academicYearId: '' })).toEqual(['academicYearId: Please select a programme.']);
    expect(issues(true, { academicYearId: 'y1' })).toEqual([]);
    expect(issues(false, { academicYearId: '' })).toEqual([]);
  });
});

describe('isCustomModeOf', () => {
  const base = { id: 'i1', name: 'School', acceptingRegistrations: true, updatedAt: '', updatedBy: '' } as RegistrationDirectory;
  const block = { academicYearId: 'y1', name: 'Workshop 1', startDate: '2026-01-01', endDate: '2026-03-01' };

  it('is true only when the directory lists open time blocks', () => {
    expect(isCustomModeOf(undefined)).toBe(false);
    expect(isCustomModeOf(null)).toBe(false);
    expect(isCustomModeOf(base)).toBe(false);
    expect(isCustomModeOf({ ...base, openTimeBlocks: [] })).toBe(false);
    expect(isCustomModeOf({ ...base, openTimeBlocks: [block] })).toBe(true);
  });
});

describe('resolveProgramme', () => {
  const block = { academicYearId: 'y1', name: 'Workshop 1', startDate: '2026-01-01', endDate: '2026-03-01' };
  const academic = { id: 'i1', name: 'School', acceptingRegistrations: true, activeAcademicYearId: 'ay', activeAcademicYearName: '2026-2027', updatedAt: '', updatedBy: '' } as RegistrationDirectory;
  const custom = { ...academic, activeAcademicYearId: undefined, activeAcademicYearName: undefined, openTimeBlocks: [block] } as RegistrationDirectory;

  it('is the active academic year when the institution is not in custom mode', () => {
    expect(resolveProgramme(academic, false, '')).toEqual({ academicYearId: 'ay', academicYearName: '2026-2027' });
    expect(resolveProgramme({ ...academic, activeAcademicYearName: undefined }, false, undefined)).toEqual({ academicYearId: 'ay', academicYearName: '' });
  });

  it('refuses when there is no active academic year', () => {
    expect(resolveProgramme({ ...academic, activeAcademicYearId: undefined }, false, '')).toEqual({
      error: "This institution hasn't set an active academic year yet. Please contact them directly.",
    });
  });

  it('is the block the visitor picked in custom mode', () => {
    expect(resolveProgramme(custom, true, 'y1')).toEqual({ academicYearId: 'y1', academicYearName: 'Workshop 1' });
  });

  it('asks for a programme in custom mode when none, or one that is not offered, was picked', () => {
    expect(resolveProgramme(custom, true, '')).toEqual({ error: 'Please select a programme.' });
    expect(resolveProgramme(custom, true, 'y9')).toEqual({ error: 'Please select a programme.' });
  });
});

describe('buildRegistrationDocument', () => {
  const programme = { academicYearId: 'ay', academicYearName: '2026-2027' };
  const parsed = (over: Record<string, unknown> = {}, student: Record<string, unknown> = {}) => {
    const r = buildSchema(false).safeParse({ ...valid, ...over, student: { ...valid.student, ...student } });
    if (!r.success) throw new Error(r.error.message);
    return r.data;
  };

  it('builds a pending registration, with the email lower-cased and no optional field that was left empty', () => {
    const doc = buildRegistrationDocument({ institutionId: 'i1', programme, values: parsed(), photoDataUrl: null });
    expect(doc).toEqual({
      institutionId: 'i1',
      academicYearId: 'ay',
      academicYearName: '2026-2027',
      status: 'pending',
      possibleDuplicate: false,
      student: {
        lastName: "O'Brien",
        firstName: 'Anne',
        requestedClass: 'Grade 7',
        dateOfBirth: '2010-05-15',
        gender: 'Female',
        email: 'anne@example.com',
      },
      mother: { ...guardian, email: 'rose@example.com' },
      father: null,
    });
    expect('middleName' in doc.student).toBe(false);
    expect('photoDataUrl' in doc.student).toBe(false);
  });

  it('keeps the optional student fields that were filled in, and the photo', () => {
    const doc = buildRegistrationDocument({
      institutionId: 'i1',
      programme,
      values: parsed({}, { middleName: 'Marie', lastSchoolAttended: 'Old School', phone: '876 555 1234', phone2: '876 555 4321', citizenId: '123' }),
      photoDataUrl: 'data:image/png;base64,AAAA',
    });
    expect(doc.student).toMatchObject({
      middleName: 'Marie',
      lastSchoolAttended: 'Old School',
      phone: '876 555 1234',
      phone2: '876 555 4321',
      citizenId: '123',
      photoDataUrl: 'data:image/png;base64,AAAA',
    });
  });

  it('writes null for a parent who is not ticked, even when their details were typed', () => {
    const values = { ...parsed({ includeFather: true, father: guardian }), includeFather: false };
    expect(buildRegistrationDocument({ institutionId: 'i1', programme, values, photoDataUrl: null }).father).toBeNull();
    const none = { ...parsed(), includeMother: false };
    expect(buildRegistrationDocument({ institutionId: 'i1', programme, values: none, photoDataUrl: null }).mother).toBeNull();
  });

  it('lower-cases the father’s email too', () => {
    const values = parsed({ includeFather: true, father: { ...guardian, email: 'DAD@Example.COM' } });
    expect(buildRegistrationDocument({ institutionId: 'i1', programme, values, photoDataUrl: null }).father?.email).toBe('dad@example.com');
  });
});
