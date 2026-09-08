import { serverTimestamp } from 'firebase/firestore';
import { ATTENDANCE_STATES, type AttendanceState } from './attendanceStates';
import {
  parseRequiredString,
  parseDateCell,
  parseEnumCell,
  matchByName,
  validateDateWithinClassTerm,
  type ImportColumn,
  type IdentityResolver,
  type ValidationRule,
  type NameCandidate,
  type RowError,
  type ClassTermInfo,
} from './spreadsheetImport';

export type { ClassTermInfo };

// Target-specific piece of the import feature for General Attendance (§9
// of SPREADSHEET_IMPORT_SPEC.md) — §17 step 6, "the grouping/merge logic,
// plus the summary-rebuild follow-up step." Firebase-free, same as the
// other three target modules — fetching candidates, doing the existing-
// document lookup, and calling rebuildSummariesForClass afterward are the
// shared import UI's job.
//
// The structurally different piece vs. Results/MDDS/Gradebook: attendance
// is one document per (classId, date, session), holding a `records` map
// keyed by student — not one document per row. A file with one row per
// student per day must be GROUPED before writing (groupGeneralAttendanceRows),
// producing one write per group, not one per row. Each write then merges
// into any already-existing day's document (`{merge: true}`, via
// PendingWrite.merge — Firestore's SDK deep-merges nested map fields under
// merge:true, so this naturally leaves already-marked students the
// spreadsheet doesn't mention untouched) rather than overwriting it — §9's
// explicit anti-data-loss requirement, and the reason this target can't
// reuse Results/MDDS/Gradebook's one-write-per-row shape at all.

export interface GeneralAttendanceImportRow {
  className: string;
  date: string;
  session: 'AM' | 'PM';
  studentName: string;
  state: AttendanceState;
  reason?: string;
  // Filled in by resolveIdentities (spreadsheetImport.ts).
  classId?: string;
  studentId?: string;
}

export type ResolvedGeneralAttendanceImportRow = GeneralAttendanceImportRow &
  Required<Pick<GeneralAttendanceImportRow, 'classId' | 'studentId'>>;

// ─── Column definitions (§9 required/optional columns) ───────────────────

export const generalAttendanceImportColumns: ImportColumn<GeneralAttendanceImportRow>[] = [
  { header: 'Class', required: true, field: 'className', parse: parseRequiredString },
  { header: 'Date', required: true, field: 'date', parse: parseDateCell },
  { header: 'Session', required: true, field: 'session', parse: (raw) => parseEnumCell(raw, ['AM', 'PM'] as const) },
  { header: 'Student', required: true, field: 'studentName', parse: parseRequiredString },
  { header: 'State', required: true, field: 'state', parse: (raw) => parseEnumCell(raw, ATTENDANCE_STATES) },
  { header: 'Reason', required: false, field: 'reason', parse: parseRequiredString },
];

// ─── Downloadable template example row (§13) ──────────────────────────────
// State "E" with a Reason filled in (rather than a bare "P") so the
// example demonstrates the one column whose meaning depends on another
// column's value, not just a real state letter in isolation.

export const generalAttendanceImportExampleRow: Record<string, string | number> = {
  Class: 'Grade 10A',
  Date: '2026-09-03',
  Session: 'AM',
  Student: 'Jane Doe',
  State: 'E',
  Reason: 'Doctor appointment',
};

// ─── Business-rule validation ──────────────────────────────────────────────

/**
 * Reason is only meaningful — and only length-checked — when State is "E"
 * (§9), mirroring GeneralAttendanceDocument.reason's own "max 50 chars; E
 * state only" comment; buildGeneralAttendanceData only ever carries it
 * into the written document under that same condition. CORRECTED (code
 * review before opening the PR): a Reason on a non-E row previously passed
 * validation silently and was then dropped at write time with no
 * indication to the importing user that their value was discarded — now a
 * hard error instead, consistent with §14's "no partial proceed... not
 * silently dropping data the user asked to import."
 */
export const generalAttendanceValidationRules: ValidationRule<GeneralAttendanceImportRow>[] = [
  {
    check: (row) => row.state !== 'E' || !row.reason || row.reason.trim().length <= 50,
    message: () => 'reason must be 50 characters or fewer (only checked when State is "E")',
  },
  {
    check: (row) => row.state === 'E' || !row.reason,
    message: () => 'reason is only used when State is "E" — clear the reason or change the state before re-uploading',
  },
];

// ─── Identity resolution (§3, §9) ─────────────────────────────────────────

export interface GeneralAttendanceIdentityCandidates {
  classes: NameCandidate[];
  students: NameCandidate[];
}

export function buildGeneralAttendanceIdentityResolvers(
  candidates: GeneralAttendanceIdentityCandidates,
): IdentityResolver<GeneralAttendanceImportRow>[] {
  return [
    {
      column: 'className',
      label: 'Class',
      resolvedField: 'classId',
      lookup: async (raw) => matchByName(candidates.classes, raw),
    },
    {
      column: 'studentName',
      label: 'Student',
      resolvedField: 'studentId',
      lookup: async (raw) => matchByName(candidates.students, raw),
    },
  ];
}

// ─── Term derivation + date-range validation ──────────────────────────────
// §9: "Term/academic year are derived from the Class + Date." A class has
// its own fixed termId (ClassDocument.termId) — not looked up per date —
// but the row's Date must actually fall within that term's date range, or
// the file is internally inconsistent (the whole reason §9 rejects a
// separate, redundant Term column in the first place). The check itself
// is shared with Subject Attendance (§10) — see
// spreadsheetImport.ts's validateDateWithinClassTerm.

export function validateGeneralAttendanceDates(
  rows: { row: ResolvedGeneralAttendanceImportRow; rowNumber: number }[],
  classTermById: Map<string, ClassTermInfo>,
): RowError[] {
  return validateDateWithinClassTerm(rows, classTermById);
}

// ─── Grouping (§9's central complexity) ────────────────────────────────────

export interface GeneralAttendanceGroup {
  classId: string;
  className: string;
  date: string;
  session: 'AM' | 'PM';
  termId: string;
  academicYearId: string;
  records: Record<string, { state: AttendanceState; studentName: string; reason?: string }>;
}

export interface GroupRowsResult {
  groups: GeneralAttendanceGroup[];
  /** Two rows in the same file targeting the same class+date+session+student — not addressed by §9's text, but silently letting the second row clobber the first inside one file contradicts the anti-data-loss reasoning §9 already applies to the merge-vs-overwrite decision, so this is treated as a blocking error instead. */
  duplicateErrors: RowError[];
}

/**
 * Groups resolved rows by (classId, date, session) into the records-map
 * shape one GeneralAttendanceDocument actually has — the reason this
 * target needs a distinct pipeline stage the row-per-write targets don't.
 * Rows whose class has no ClassTermInfo entry are skipped (already
 * reported by validateGeneralAttendanceDates, which must run first).
 */
export function groupGeneralAttendanceRows(
  rows: { row: ResolvedGeneralAttendanceImportRow; rowNumber: number }[],
  classTermById: Map<string, ClassTermInfo>,
): GroupRowsResult {
  const groupsByKey = new Map<string, GeneralAttendanceGroup>();
  const seenByGroupKey = new Map<string, Map<string, number>>();
  const duplicateErrors: RowError[] = [];

  for (const { row, rowNumber } of rows) {
    const info = classTermById.get(row.classId);
    if (!info) continue;

    const groupKey = `${row.classId}::${row.date}::${row.session}`;
    let group = groupsByKey.get(groupKey);
    if (!group) {
      group = {
        classId: row.classId,
        className: row.className,
        date: row.date,
        session: row.session,
        termId: info.termId,
        academicYearId: info.academicYearId,
        records: {},
      };
      groupsByKey.set(groupKey, group);
      seenByGroupKey.set(groupKey, new Map());
    }

    const seen = seenByGroupKey.get(groupKey)!;
    if (seen.has(row.studentId)) {
      duplicateErrors.push({
        row: rowNumber,
        message: `duplicate entry for "${row.studentName}" on ${row.date} ${row.session} in "${row.className}" (already set on row ${seen.get(row.studentId)})`,
      });
      continue;
    }
    seen.set(row.studentId, rowNumber);

    group.records[row.studentId] = {
      state: row.state,
      studentName: row.studentName,
      ...(row.state === 'E' && row.reason ? { reason: row.reason.trim() } : {}),
    };
  }

  return { groups: Array.from(groupsByKey.values()), duplicateErrors };
}

// ─── Write shape (§9) ───────────────────────────────────────────────────────

export interface GeneralAttendanceWriteContext {
  institutionId: string;
  /** The importing user's own uid — matches writeSessionDoc's submittedBy. */
  submittedBy: string;
}

/**
 * One group's document data — matches writeSessionDoc's field shape
 * (attendance/general/index.tsx), except `records` here is only the
 * group's covered students (merge:true handles leaving the rest of an
 * existing day's records untouched — see module comment), and `createdAt`
 * is omitted entirely on a merge into an existing document rather than
 * needing to know its prior value, achieving the same effect as
 * writeSessionDoc's `existingDoc ? existingDoc.createdAt : serverTimestamp()`.
 */
export function buildGeneralAttendanceData(
  group: GeneralAttendanceGroup,
  ctx: GeneralAttendanceWriteContext,
  isUpdate: boolean,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    institutionId: ctx.institutionId,
    classId: group.classId,
    className: group.className,
    termId: group.termId,
    academicYearId: group.academicYearId,
    date: group.date,
    session: group.session,
    records: group.records,
    submittedBy: ctx.submittedBy,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (!isUpdate) data.createdAt = serverTimestamp();
  return data;
}
