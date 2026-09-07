import * as XLSX from '@e965/xlsx';
import { serverTimestamp } from 'firebase/firestore';
import type {
  ImportColumn,
  IdentityMatch,
  IdentityResolver,
  ValidationRule,
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

function requireString(raw: string | number): { ok: true; value: string } {
  return { ok: true, value: String(raw).trim() };
}

function parseNumber(
  raw: string | number,
  label: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `"${raw}" is not a valid ${label}` };
}

/**
 * Accepts either an ISO "YYYY-MM-DD" string or an Excel date-serial number
 * (XLSX date cells come through as a raw number via sheet_to_json unless
 * read with cellDates: true — parseSpreadsheetFile doesn't set that, so
 * this has to handle both shapes itself).
 */
function parseDate(raw: string | number): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return { ok: false, error: `"${raw}" is not a valid date` };
    const mm = String(parsed.m).padStart(2, '0');
    const dd = String(parsed.d).padStart(2, '0');
    return { ok: true, value: `${parsed.y}-${mm}-${dd}` };
  }
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(new Date(trimmed).getTime())) {
    return { ok: false, error: `"${raw}" is not a valid date (expected YYYY-MM-DD)` };
  }
  return { ok: true, value: trimmed };
}

export const resultsImportColumns: ImportColumn<ResultImportRow>[] = [
  { header: 'Student', required: true, field: 'studentName', parse: requireString },
  { header: 'Class', required: true, field: 'className', parse: requireString },
  { header: 'Subject', required: true, field: 'subjectName', parse: requireString },
  { header: 'Term', required: true, field: 'termName', parse: requireString },
  { header: 'Assessment Name', required: true, field: 'assessmentName', parse: requireString },
  {
    header: 'Assessment Type',
    required: true,
    field: 'assessmentType',
    parse: (raw) => {
      const normalized = String(raw).trim().toLowerCase();
      if (normalized === 'coursework' || normalized === 'exam') return { ok: true, value: normalized };
      return { ok: false, error: `"${raw}" must be "coursework" or "exam"` };
    },
  },
  { header: 'Score', required: true, field: 'score', parse: (raw) => parseNumber(raw, 'score') },
  { header: 'Max Score', required: true, field: 'maxScore', parse: (raw) => parseNumber(raw, 'max score') },
  {
    header: 'Weight',
    required: false,
    field: 'weight',
    parse: (raw) => {
      const result = parseNumber(raw, 'weight');
      if (!result.ok) return result;
      if (result.value < 0 || result.value > 1) return { ok: false, error: 'weight must be between 0 and 1' };
      return result;
    },
  },
  { header: 'Date', required: false, field: 'date', parse: parseDate },
];

// ─── Business-rule validation (§6) ────────────────────────────────────────

export const resultsValidationRules: ValidationRule<ResultImportRow>[] = [
  {
    check: (row) => row.score <= row.maxScore,
    message: (row) => `score (${row.score}) exceeds max score (${row.maxScore})`,
  },
];

// ─── Identity resolution (§3, §6) ─────────────────────────────────────────

export interface NameCandidate {
  id: string;
  name: string;
}

export interface ResultsIdentityCandidates {
  students: NameCandidate[];
  classes: NameCandidate[];
  subjects: NameCandidate[];
  terms: NameCandidate[];
}

/** Case-insensitive, trimmed exact match against a candidate list (§3 step 1). */
function matchByName(candidates: NameCandidate[], rawValue: string): IdentityMatch[] {
  const needle = rawValue.trim().toLowerCase();
  return candidates
    .filter((c) => c.name.trim().toLowerCase() === needle)
    .map((c) => ({ id: c.id, label: c.name }));
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
