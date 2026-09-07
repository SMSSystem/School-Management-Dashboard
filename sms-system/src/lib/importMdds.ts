import { serverTimestamp } from 'firebase/firestore';
import {
  parseRequiredString,
  parseDateCell,
  parseEnumCell,
  parseBooleanCell,
  matchByName,
  type ImportColumn,
  type IdentityResolver,
  type ValidationRule,
  type NameCandidate,
} from './spreadsheetImport';

// Target-specific piece of the import feature for MDDS/disciplinary
// actions (§7 of SPREADSHEET_IMPORT_SPEC.md) — §17 step 3, "same shape as
// Results, low incremental cost once step 2 lands." Firebase-free for the
// same reason importResults.ts is: fetching live candidates and attaching
// a Firestore ref is the shared import UI's job (§17 step 4).

export type MddsActionType = 'merit' | 'demerit' | 'detention' | 'suspension';
const MDDS_TYPES: readonly MddsActionType[] = ['merit', 'demerit', 'detention', 'suspension'];

// Matches DisciplinaryActionForm.tsx's NEEDS_DATE_RANGE — only these two
// types ever carry endDate/served; merit/demerit omit both entirely.
const NEEDS_RANGE = new Set<MddsActionType>(['detention', 'suspension']);

export interface MddsImportRow {
  studentName: string;
  className: string;
  termName: string;
  type: MddsActionType;
  reason: string;
  date: string;
  endDate?: string;
  served?: boolean;
  // Filled in by resolveIdentities (spreadsheetImport.ts) once every
  // identity column below has resolved to exactly one match.
  studentId?: string;
  classId?: string;
  termId?: string;
}

export type ResolvedMddsImportRow = MddsImportRow &
  Required<Pick<MddsImportRow, 'studentId' | 'classId' | 'termId'>>;

// ─── Column definitions (§7 required/optional columns) ───────────────────

function parseReason(raw: string | number): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(raw).trim();
  if (value.length > 500) return { ok: false, error: 'must be 500 characters or fewer' };
  return { ok: true, value };
}

export const mddsImportColumns: ImportColumn<MddsImportRow>[] = [
  { header: 'Student', required: true, field: 'studentName', parse: parseRequiredString },
  { header: 'Class', required: true, field: 'className', parse: parseRequiredString },
  { header: 'Term', required: true, field: 'termName', parse: parseRequiredString },
  { header: 'Type', required: true, field: 'type', parse: (raw) => parseEnumCell(raw, MDDS_TYPES) },
  { header: 'Reason', required: true, field: 'reason', parse: parseReason },
  { header: 'Date', required: true, field: 'date', parse: parseDateCell },
  { header: 'End Date', required: false, field: 'endDate', parse: parseDateCell },
  { header: 'Served', required: false, field: 'served', parse: parseBooleanCell },
];

// No cross-field business rule for MDDS (unlike Results' score <= maxScore)
// — every §7 "Validation" bullet (type enum, reason length) is a single-cell
// format check, handled above in the column definitions instead. Kept as an
// explicit empty export so callers can treat every target uniformly.
export const mddsValidationRules: ValidationRule<MddsImportRow>[] = [];

// ─── Identity resolution (§3, §7) ─────────────────────────────────────────

export interface MddsIdentityCandidates {
  students: NameCandidate[];
  classes: NameCandidate[];
  terms: NameCandidate[];
}

/**
 * Builds the 3 identity resolvers for MDDS (Student, Class, Term — §7)
 * from already-fetched candidate lists — see importResults.ts's identical
 * pattern and rationale.
 */
export function buildMddsIdentityResolvers(candidates: MddsIdentityCandidates): IdentityResolver<MddsImportRow>[] {
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
      column: 'termName',
      label: 'Term',
      resolvedField: 'termId',
      lookup: async (raw) => matchByName(candidates.terms, raw),
    },
  ];
}

// ─── Write shape (§7 "Written fields") ────────────────────────────────────

// ─── Advisory duplicate detection (§19.3) ─────────────────────────────────

/**
 * Identity key for the §19.3 advisory duplicate count — Student, Class,
 * Type, Term, and Date, per the spec's chosen key for MDDS specifically
 * (Assessment Name isn't applicable here, unlike Results — Date takes its
 * place). Must be applied identically to resolved import rows and to
 * existing-document data fetched by the caller.
 */
export function mddsDuplicateKey(row: {
  studentId: string;
  classId: string;
  termId: string;
  type: MddsActionType;
  date: string;
}): string {
  return [row.studentId, row.classId, row.termId, row.type, row.date].join('::');
}

export interface MddsWriteContext {
  institutionId: string;
  /** The importing user's own uid — every import is self-attributed, never on behalf of another teacher (§2). */
  issuedBy: string;
  issuedByName: string;
  issuedByRole: string;
}

/**
 * Builds one disciplinary-action document's field data — matching
 * DisciplinaryActionDocument (firebase.ts) and
 * DisciplinaryActionForm.tsx's create path exactly, including its
 * omit-not-null convention: endDate/served are only ever present for
 * detention/suspension rows, and endDate only when actually supplied.
 * Returns plain data, not a PendingWrite — see importResults.ts's
 * buildResultData for why ref attachment is left to the caller.
 */
export function buildMddsData(row: ResolvedMddsImportRow, ctx: MddsWriteContext): Record<string, unknown> {
  const needsRange = NEEDS_RANGE.has(row.type);
  const data: Record<string, unknown> = {
    institutionId: ctx.institutionId,
    studentId: row.studentId,
    studentName: row.studentName,
    classId: row.classId,
    className: row.className,
    termId: row.termId,
    termName: row.termName,
    type: row.type,
    reason: row.reason,
    date: row.date,
    issuedBy: ctx.issuedBy,
    issuedByName: ctx.issuedByName,
    issuedByRole: ctx.issuedByRole,
    createdAt: serverTimestamp(),
  };
  if (needsRange && row.endDate) data.endDate = row.endDate;
  if (needsRange) data.served = row.served ?? false;
  return data;
}
