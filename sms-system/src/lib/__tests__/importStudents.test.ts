import { describe, it, expect } from 'vitest';
import { validateStructure, parseRows, resolveIdentities, validateRows } from '../spreadsheetImport';
import {
  studentsImportColumns,
  studentsValidationRules,
  buildStudentsIdentityResolvers,
  type StudentImportRow,
  type StudentsIdentityCandidates,
} from '../importStudents';

const candidates: StudentsIdentityCandidates = {
  classes: [{ id: 'cls1', name: 'Grade 10A' }, { id: 'cls2', name: 'Grade 10A' }, { id: 'cls3', name: 'Grade 11B' }],
  houses: [{ id: 'hse1', name: 'Falcon' }],
};

// ─── Column parsing ───────────────────────────────────────────────────────

describe('studentsImportColumns', () => {
  it('parses a clean, fully-populated row', () => {
    const { rows, errors } = parseRows(
      [
        {
          'First Name': 'Jane',
          'Last Name': 'Doe',
          Email: 'Jane.Doe@Example.com',
          Phone: '+1 555-123-4567',
          'Second Phone': '+1 555-987-6543',
          'Citizen ID or TRN': 'TRN-00012345',
          'Student ID': 'STU-2026-014',
          'Date of Birth': '2012-05-14',
          Gender: 'Female',
          Class: 'Grade 11B',
          House: 'Falcon',
        },
      ],
      studentsImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.com',
        phone: '+1 555-123-4567',
        phone2: '+1 555-987-6543',
        idNumber: 'TRN-00012345',
        institutionStudentId: 'STU-2026-014',
        dateOfBirth: '2012-05-14',
        gender: 'Female',
        className: 'Grade 11B',
        houseName: 'Falcon',
      },
    ]);
  });

  it('requires only First Name, Last Name, and Email', () => {
    const result = validateStructure([{ 'First Name': 'Jane', 'Last Name': 'Doe', Email: 'jane@example.com' }], studentsImportColumns);
    expect(result.ok).toBe(true);
  });

  it('flags every missing required header via validateStructure', () => {
    const result = validateStructure([{ 'First Name': 'Jane' }], studentsImportColumns);
    expect(result.ok).toBe(false);
    expect(result.missingHeaders).toEqual(['Last Name', 'Email']);
  });

  it('leaves optional fields unset when omitted, without an error', () => {
    const { rows, errors } = parseRows(
      [{ 'First Name': 'Jane', 'Last Name': 'Doe', Email: 'jane@example.com' }],
      studentsImportColumns,
    );
    expect(errors).toEqual([]);
    expect(rows[0].phone).toBeUndefined();
    expect(rows[0].idNumber).toBeUndefined();
    expect(rows[0].className).toBeUndefined();
  });

  it('rejects a name containing digits', () => {
    const { errors } = parseRows(
      [{ 'First Name': 'Jane1', 'Last Name': 'Doe', Email: 'jane@example.com' }],
      studentsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'First Name: use letters, spaces, apostrophes, or hyphens only' }]);
  });

  it('rejects a malformed email', () => {
    const { errors } = parseRows(
      [{ 'First Name': 'Jane', 'Last Name': 'Doe', Email: 'not-an-email' }],
      studentsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Email: is not a valid email address' }]);
  });

  it('rejects a malformed phone number', () => {
    const { errors } = parseRows(
      [{ 'First Name': 'Jane', 'Last Name': 'Doe', Email: 'jane@example.com', Phone: 'abc' }],
      studentsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Phone: is not a valid phone number' }]);
  });

  it('rejects a Citizen ID or TRN over 50 characters', () => {
    const { errors } = parseRows(
      [{ 'First Name': 'Jane', 'Last Name': 'Doe', Email: 'jane@example.com', 'Citizen ID or TRN': 'x'.repeat(51) }],
      studentsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Citizen ID or TRN: Citizen ID or TRN must be 50 characters or less' }]);
  });

  it('rejects a Gender value outside Male/Female', () => {
    const { errors } = parseRows(
      [{ 'First Name': 'Jane', 'Last Name': 'Doe', Email: 'jane@example.com', Gender: 'Other' }],
      studentsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Gender: "Other" must be "Male" or "Female"' }]);
  });

  it('rejects a malformed Date of Birth', () => {
    const { errors } = parseRows(
      [{ 'First Name': 'Jane', 'Last Name': 'Doe', Email: 'jane@example.com', 'Date of Birth': 'not-a-date' }],
      studentsImportColumns,
    );
    expect(errors).toEqual([{ row: 2, message: 'Date of Birth: "not-a-date" is not a valid date (expected YYYY-MM-DD)' }]);
  });
});

// ─── Identity resolution ──────────────────────────────────────────────────

describe('buildStudentsIdentityResolvers', () => {
  it('auto-resolves Class/House when each name has exactly one match', async () => {
    const row: StudentImportRow = {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com',
      className: 'Grade 11B', houseName: 'Falcon',
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildStudentsIdentityResolvers(candidates));
    expect(needsResolution).toEqual([]);
    expect(resolved).toEqual([{ ...row, classId: 'cls3', houseId: 'hse1' }]);
  });

  it('trivially resolves when Class/House are both omitted', async () => {
    const row: StudentImportRow = { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' };
    const { resolved, needsResolution } = await resolveIdentities([row], buildStudentsIdentityResolvers(candidates));
    expect(needsResolution).toEqual([]);
    expect(resolved).toEqual([row]);
  });

  it('flags an ambiguous class name (two classes share "Grade 10A")', async () => {
    const row: StudentImportRow = {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', className: 'Grade 10A',
    };
    const { resolved, needsResolution } = await resolveIdentities([row], buildStudentsIdentityResolvers(candidates));
    expect(resolved).toEqual([]);
    expect(needsResolution).toEqual([
      { column: 'Class', value: 'Grade 10A', matches: [{ id: 'cls1', label: 'Grade 10A' }, { id: 'cls2', label: 'Grade 10A' }] },
    ]);
  });

  it('flags a house name with no match', async () => {
    const row: StudentImportRow = {
      firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', houseName: 'Nonexistent House',
    };
    const { needsResolution } = await resolveIdentities([row], buildStudentsIdentityResolvers(candidates));
    expect(needsResolution).toEqual([{ column: 'House', value: 'Nonexistent House', matches: [] }]);
  });
});

// ─── Business-rule validation ─────────────────────────────────────────────

describe('studentsValidationRules', () => {
  it('is empty — no cross-field rule for a student profile row', () => {
    expect(studentsValidationRules).toEqual([]);
    const row: StudentImportRow = { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' };
    const { valid, errors } = validateRows([row], studentsValidationRules);
    expect(errors).toEqual([]);
    expect(valid).toEqual([row]);
  });
});
