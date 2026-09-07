import { serverTimestamp } from 'firebase/firestore';
import {
  parseRequiredString,
  parseNumberCell,
  parseDateCell,
  parseEnumCell,
  matchByName,
  type ImportColumn,
  type IdentityResolver,
  type ValidationRule,
  type NameCandidate,
} from './spreadsheetImport';

// Target-specific piece of the import feature for Results (§6 of
// SPREADSHEET_IMPORT_SPEC.md) — the first of the 5 targets implemented
// (§17 step 2), chosen to prove the shared flow end to end (identity
// resolution, validation, write shape) before Attendance's added grouping
// complexity (§9, §10).
//
// Deliberately firebase-free, same as spreadsheetExport.ts: this module
// only transforms data. Fetching the live candidate lists that
// buildResultsIdentityResolvers() takes as input, and turning
// buildResultData()'s output into an actual PendingWrite (attaching a
// Firestore ref via institutionCollection), is the shared import UI's job
// (§17 step 4) — mirroring how ResultForm.tsx's own Firestore queries live
// in the component, not in a lib file.

export interface ResultImportRow {
  studentName: string;
  className: string;
  subjectName: string;
  termName: string;
  assessmentName: string;
  assessmentType: 'coursework' | 'exam';
  score: number;
  maxScore: number;
  weight?: number;
  date?: string;
  // Filled in by resolveIdentities (spreadsheetImport.ts) once every
  // identity column below has resolved to exactly one match.
  studentId?: string;
  classId?: string;
  subjectId?: string;
  termId?: string;
}

export type ResolvedResultImportRow = ResultImportRow &
  Required<Pick<ResultImportRow, 'studentId' | 'classId' | 'subjectId' | 'termId'>>;

// ─── Column definitions (§6 required/optional columns) ───────────────────

export const resultsImportColumns: ImportColumn<ResultImportRow>[] = [
  { header: 'Student', required: true, field: 'studentName', parse: parseRequiredString },
  { header: 'Class', required: true, field: 'className', parse: parseRequiredString },
  { header: 'Subject', required: true, field: 'subjectName', parse: parseRequiredString },
  { header: 'Term', required: true, field: 'termName', parse: parseRequiredString },
  { header: 'Assessment Name', required: true, field: 'assessmentName', parse: parseRequiredString },
  {
    header: 'Assessment Type',
    required: true,
    field: 'assessmentType',
    parse: (raw) => parseEnumCell(raw, ['coursework', 'exam'] as const),
  },
  { header: 'Score', required: true, field: 'score', parse: (raw) => parseNumberCell(raw, 'score') },
  { header: 'Max Score', required: true, field: 'maxScore', parse: (raw) => parseNumberCell(raw, 'max score') },
  {
    header: 'Weight',
    required: false,
    field: 'weight',
    parse: (raw) => {
      const result = parseNumberCell(raw, 'weight');
      if (!result.ok) return result;
      const value = result.value as number;
      if (value < 0 || value > 1) return { ok: false, error: 'weight must be between 0 and 1' };
      return result;
    },
  },
  { header: 'Date', required: false, field: 'date', parse: parseDateCell },
];

// ─── Downloadable template example row (§13) ──────────────────────────────
// Keyed by column header, not field name — matches a real upload's header
// row. Demonstrates a valid enum value ("exam") and a correctly formatted
// date, per §13's worked-example requirement.

export const resultsImportExampleRow: Record<string, string | number> = {
  Student: 'Jane Doe',
  Class: 'Grade 10A',
  Subject: 'Mathematics',
  Term: 'Term 1',
  'Assessment Name': 'Midterm Exam',
  'Assessment Type': 'exam',
  Score: 85,
  'Max Score': 100,
  Weight: 0.3,
  Date: '2026-10-15',
};

// ─── Business-rule validation (§6) ────────────────────────────────────────

export const resultsValidationRules: ValidationRule<ResultImportRow>[] = [
  {
    check: (row) => row.score <= row.maxScore,
    message: (row) => `score (${row.score}) exceeds max score (${row.maxScore})`,
  },
];

// ─── Identity resolution (§3, §6) ─────────────────────────────────────────

export interface ResultsIdentityCandidates {
  students: NameCandidate[];
  classes: NameCandidate[];
  subjects: NameCandidate[];
  terms: NameCandidate[];
}

/**
 * Builds the 4 identity resolvers for Results (Student, Class, Subject,
 * Term — §6) from already-fetched candidate lists, so resolution itself
 * stays pure and testable. Candidate lists must already reflect any
 * role-based scoping (e.g. a regular_teacher's subjects filtered to their
 * own teacherIds, matching ResultForm.tsx) — that filtering happens where
 * the candidates are fetched, not here.
 *
 * Student resolution is name-only for v1: §3 also describes preferring
 * institutionStudentId when present, but §6 doesn't declare a separate
 * "Institution Student ID" column for Results, so there's nothing to
 * prefer over the name yet. Adding that column later is additive — it
 * doesn't require reshaping this function.
 */
export function buildResultsIdentityResolvers(
  candidates: ResultsIdentityCandidates,
): IdentityResolver<ResultImportRow>[] {
  return [
    {
      column: 'studentName',
      label: 'Student',
      resolvedField: 'studentId',
      lookup: async (raw) => matchByName(candidates.students, raw),
    },
    {
      column: 'className',
      label: 'Class',
      resolvedField: 'classId',
      lookup: async (raw) => matchByName(candidates.classes, raw),
    },
    {
      column: 'subjectName',
      label: 'Subject',
      resolvedField: 'subjectId',
      lookup: async (raw) => matchByName(candidates.subjects, raw),
    },
    {
      column: 'termName',
      label: 'Term',
      resolvedField: 'termId',
      lookup: async (raw) => matchByName(candidates.terms, raw),
    },
  ];
}

// ─── Advisory duplicate detection (§19.3) ─────────────────────────────────

/**
 * Identity key for the §19.3 advisory duplicate count — Student, Class,
 * Subject, Term, and Assessment Name, per the spec's chosen key for
 * Results specifically. Must be applied identically to resolved import
 * rows and to existing-document data fetched by the caller.
 */
export function resultDuplicateKey(row: {
  studentId: string;
  classId: string;
  subjectId: string;
  termId: string;
  assessmentName: string;
}): string {
  return [row.studentId, row.classId, row.subjectId, row.termId, row.assessmentName.trim().toLowerCase()].join('::');
}

// ─── Write shape (§6 "Written fields") ────────────────────────────────────

export interface ResultWriteContext {
  institutionId: string;
  /** The importing user's own uid — every import is self-attributed, never on behalf of another teacher (§2). */
  teacherId: string;
  teacherName: string;
  departmentId: string;
}

/**
 * Builds one result document's field data — matching ResultDocument
 * (firebase.ts) and ResultForm.tsx's create path exactly, so an imported
 * row is indistinguishable from a manually-entered one. No
 * gradebookColumnId/source — that's the Gradebook target (§8), not this
 * one. Returns plain data, not a PendingWrite: attaching a Firestore ref
 * is the caller's job (see module comment above).
 */
export function buildResultData(row: ResolvedResultImportRow, ctx: ResultWriteContext): Record<string, unknown> {
  const data: Record<string, unknown> = {
    studentId: row.studentId,
    studentName: row.studentName,
    teacherId: ctx.teacherId,
    teacherName: ctx.teacherName,
    classId: row.classId,
    className: row.className,
    termId: row.termId,
    institutionId: ctx.institutionId,
    departmentId: ctx.departmentId,
    subjectId: row.subjectId,
    assessmentName: row.assessmentName,
    assessmentType: row.assessmentType,
    score: row.score,
    maxScore: row.maxScore,
    createdAt: serverTimestamp(),
  };
  if (row.weight !== undefined) data.weight = row.weight;
  if (row.date !== undefined) data.date = row.date;
  return data;
}
