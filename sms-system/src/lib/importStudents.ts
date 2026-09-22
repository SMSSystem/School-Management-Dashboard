import {
  parseRequiredString,
  parseDateCell,
  parseEnumCell,
  matchByName,
  type CellParseResult,
  type ImportColumn,
  type IdentityResolver,
  type ValidationRule,
  type NameCandidate,
} from './spreadsheetImport';
import { namePattern, phonePattern, emailPattern } from './fieldPatterns';

// Target-specific piece of the import feature for Students (6th target,
// per docs/miscellaneous-specs/SPREADSHEET_IMPORT_STUDENTS_SPEC.md Part C).
//
// Deliberately Firebase-free, same convention every other target module
// follows (importResults.ts, importMdds.ts, etc.) — this module only
// transforms data. Unlike every other target, there is intentionally no
// buildStudentData()-style write-shape builder here: every other target's
// write only ever references an *already-existing* users/{uid}, so
// building its Firestore payload is a pure function of already-resolved
// data. A Students row instead has to create a brand-new Firebase Auth
// account first — the resulting uid doesn't exist until that call
// completes — so the write itself has to live in import/index.tsx
// alongside the Auth call it depends on, not here. See the spec's Part C
// "New commit path" for that logic.

export interface StudentImportRow {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  phone2?: string;
  idNumber?: string;
  institutionStudentId?: string;
  dateOfBirth?: string;
  gender?: 'Male' | 'Female';
  className?: string; // identity-resolved, optional
  houseName?: string; // identity-resolved, optional
  // Filled in by resolveIdentities (spreadsheetImport.ts) once Class/House
  // (if provided) resolve to exactly one match. Stay optional even after
  // resolution — unlike every other target's identity columns, Class/House
  // are themselves optional here, so a row with no Class value never gets
  // classId set at all.
  classId?: string;
  houseId?: string;
}

export type ResolvedStudentImportRow = StudentImportRow;

// ─── Per-cell validation not already covered by spreadsheetImport.ts's
// reusable primitives ──────────────────────────────────────────────────
// First/Last Name and Email need format validation beyond
// parseRequiredString's plain non-empty check, matching the same patterns
// AdminCreateUserForm.tsx's createUserSchema already validates against
// (namePattern, phonePattern) or the equivalent for email (emailPattern) —
// so an imported profile can never hold a shape the Create Account form
// itself would reject.

function parseNameCell(raw: string | number): CellParseResult {
  const value = String(raw).trim();
  if (!namePattern.test(value)) {
    return { ok: false, error: 'use letters, spaces, apostrophes, or hyphens only' };
  }
  return { ok: true, value };
}

function parseEmailCell(raw: string | number): CellParseResult {
  const value = String(raw).trim();
  if (!emailPattern.test(value)) {
    return { ok: false, error: 'is not a valid email address' };
  }
  return { ok: true, value: value.toLowerCase() };
}

function parsePhoneCell(raw: string | number): CellParseResult {
  const value = String(raw).trim();
  if (!phonePattern.test(value)) {
    return { ok: false, error: 'is not a valid phone number' };
  }
  return { ok: true, value };
}

function parseMaxLengthCell(raw: string | number, maxLength: number, label: string): CellParseResult {
  const value = String(raw).trim();
  if (value.length > maxLength) {
    return { ok: false, error: `${label} must be ${maxLength} characters or less` };
  }
  return { ok: true, value };
}

// ─── Column definitions (spec Part C's table) ─────────────────────────────
// Header names are free to define cleanly (no existing Students export to
// defer to, unlike Results — see importResults.ts's own module comment for
// that precedent).

export const studentsImportColumns: ImportColumn<StudentImportRow>[] = [
  { header: 'First Name', required: true, field: 'firstName', parse: parseNameCell },
  { header: 'Last Name', required: true, field: 'lastName', parse: parseNameCell },
  { header: 'Email', required: true, field: 'email', parse: parseEmailCell },
  { header: 'Phone', required: false, field: 'phone', parse: parsePhoneCell },
  { header: 'Second Phone', required: false, field: 'phone2', parse: parsePhoneCell },
  {
    header: 'Citizen ID or TRN',
    required: false,
    field: 'idNumber',
    parse: (raw) => parseMaxLengthCell(raw, 50, 'Citizen ID or TRN'),
  },
  {
    header: 'Student ID',
    required: false,
    field: 'institutionStudentId',
    parse: (raw) => parseMaxLengthCell(raw, 50, 'Student ID'),
  },
  { header: 'Date of Birth', required: false, field: 'dateOfBirth', parse: parseDateCell },
  {
    header: 'Gender',
    required: false,
    field: 'gender',
    parse: (raw) => parseEnumCell(raw, ['Male', 'Female'] as const),
  },
  { header: 'Class', required: false, field: 'className', parse: parseRequiredString },
  { header: 'House', required: false, field: 'houseName', parse: parseRequiredString },
];

// ─── Downloadable template example row ────────────────────────────────────
// Keyed by column header, not field name — matches a real upload's header
// row. Every column (including optional ones) gets a real value, not a
// blank, per §13's worked-example requirement (same convention as
// importResults.ts's resultsImportExampleRow).

export const studentsImportExampleRow: Record<string, string | number> = {
  'First Name': 'Jane',
  'Last Name': 'Doe',
  Email: 'jane.doe@example.com',
  Phone: '+1 555-123-4567',
  'Second Phone': '+1 555-987-6543',
  'Citizen ID or TRN': 'TRN-00012345',
  'Student ID': 'STU-2026-014',
  'Date of Birth': '2012-05-14',
  Gender: 'Female',
  Class: 'Grade 10A',
  House: 'Falcon',
};

// ─── Business-rule validation ──────────────────────────────────────────────
// Empty on purpose — unlike Results' score <= maxScore, there's no
// cross-field rule for a student profile row beyond the per-cell parsing
// above. Exported anyway (rather than inlining `[]` in import/index.tsx)
// so the students target wires in symmetrically with every other target.

export const studentsValidationRules: ValidationRule<StudentImportRow>[] = [];

// ─── Identity resolution (Class, House — both optional) ──────────────────

export interface StudentsIdentityCandidates {
  classes: NameCandidate[];
  houses: NameCandidate[];
}

/**
 * Builds the 2 identity resolvers for Students (Class, House) from
 * already-fetched candidate lists, mirroring buildResultsIdentityResolvers.
 * No "Student" resolver — unlike every other target, a Students row never
 * references an existing student; it creates one.
 */
export function buildStudentsIdentityResolvers(
  candidates: StudentsIdentityCandidates,
): IdentityResolver<StudentImportRow>[] {
  return [
    {
      column: 'className',
      label: 'Class',
      resolvedField: 'classId',
      lookup: async (raw) => matchByName(candidates.classes, raw),
    },
    {
      column: 'houseName',
      label: 'House',
      resolvedField: 'houseId',
      lookup: async (raw) => matchByName(candidates.houses, raw),
    },
  ];
}
