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

// Target-specific piece of the import feature for Subject Attendance (§10
// of SPREADSHEET_IMPORT_SPEC.md) — §17 step 7, "reuses §9's grouping logic
// with the narrower column set." Firebase-free, same as the other target
// modules.
//
// Structurally identical to General Attendance (§9) — one document per
// group holding a records map, grouped before any write happens, merged
// (not overwritten) into an existing document — with three concrete
// differences, all confirmed against subject/index.tsx's own write code
// and firestore.rules rather than assumed from §10's prose alone:
//   - Grouping key is (subjectId, classId, sessionDate), not
//     (classId, date, session) — no AM/PM split, but Subject joins the key
//     since one class can have attendance recorded for several subjects
//     on the same day.
//   - Required columns: Subject, Class, Date, Student, State — Subject is
//     a new identity column §9 didn't have; no Session column.
//   - The written document carries `teacherId` (the importing user's own
//     uid, matching commitSave's `teacherId: user.uid` and the
//     subjectAttendance create/update rule's ownership check), which
//     GeneralAttendanceDocument has no equivalent field for.
// No post-import rebuild step (unlike §9) — rebuildSummariesForClass only
// reads generalAttendance today, so this target doesn't affect that
// aggregate at all; §10 says so explicitly.

export interface SubjectAttendanceImportRow {
  subjectName: string;
  className: string;
  date: string;
  studentName: string;
  state: AttendanceState;
  reason?: string;
  // Filled in by resolveIdentities (spreadsheetImport.ts).
  subjectId?: string;
  classId?: string;
  studentId?: string;
}

export type ResolvedSubjectAttendanceImportRow = SubjectAttendanceImportRow &
  Required<Pick<SubjectAttendanceImportRow, 'subjectId' | 'classId' | 'studentId'>>;

// ─── Column definitions (§10 required/optional columns) ───────────────────

export const subjectAttendanceImportColumns: ImportColumn<SubjectAttendanceImportRow>[] = [
  { header: 'Subject', required: true, field: 'subjectName', parse: parseRequiredString },
  { header: 'Class', required: true, field: 'className', parse: parseRequiredString },
  { header: 'Date', required: true, field: 'date', parse: parseDateCell },
  { header: 'Student', required: true, field: 'studentName', parse: parseRequiredString },
  { header: 'State', required: true, field: 'state', parse: (raw) => parseEnumCell(raw, ATTENDANCE_STATES) },
  { header: 'Reason', required: false, field: 'reason', parse: parseRequiredString },
];

// ─── Downloadable template example row (§13) ──────────────────────────────
// Same State "E" + Reason choice as General Attendance's example, for the
// same reason — see importGeneralAttendance.ts's comment.

export const subjectAttendanceImportExampleRow: Record<string, string | number> = {
  Subject: 'Mathematics',
  Class: 'Grade 10A',
  Date: '2026-09-03',
  Student: 'Jane Doe',
  State: 'E',
  Reason: 'Doctor appointment',
};

// ─── Business-rule validation ──────────────────────────────────────────────

/**
 * Same convention as General Attendance (§9): Reason is only meaningful —
 * and only length-checked — when State is "E"; buildSubjectAttendanceData
 * only ever carries it into the written document under that same
 * condition. CORRECTED (code review before opening the PR): a Reason on a
 * non-E row previously passed validation silently and was dropped at
 * write time — see importGeneralAttendance.ts's identical correction.
 */
export const subjectAttendanceValidationRules: ValidationRule<SubjectAttendanceImportRow>[] = [
  {
    check: (row) => row.state !== 'E' || !row.reason || row.reason.trim().length <= 50,
    message: () => 'reason must be 50 characters or fewer (only checked when State is "E")',
  },
  {
    check: (row) => row.state === 'E' || !row.reason,
    message: () => 'reason is only used when State is "E" — clear the reason or change the state before re-uploading',
  },
];

// ─── Identity resolution (§3, §10) ────────────────────────────────────────

export interface SubjectAttendanceIdentityCandidates {
  subjects: NameCandidate[];
  classes: NameCandidate[];
  students: NameCandidate[];
}

export function buildSubjectAttendanceIdentityResolvers(
  candidates: SubjectAttendanceIdentityCandidates,
): IdentityResolver<SubjectAttendanceImportRow>[] {
  return [
    {
      column: 'subjectName',
      label: 'Subject',
      resolvedField: 'subjectId',
      lookup: async (raw) => matchByName(candidates.subjects, raw),
    },
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

// ─── Date-vs-term validation — shared with General Attendance ────────────

export type { ClassTermInfo };

export function validateSubjectAttendanceDates(
  rows: { row: ResolvedSubjectAttendanceImportRow; rowNumber: number }[],
  classTermById: Map<string, ClassTermInfo>,
): RowError[] {
  return validateDateWithinClassTerm(rows, classTermById);
}

// ─── Grouping (§10's central complexity, reused from §9) ─────────────────

export interface SubjectAttendanceGroup {
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  sessionDate: string;
  termId: string;
  academicYearId: string;
  records: Record<string, { state: AttendanceState; studentName: string; reason?: string }>;
}

export interface GroupRowsResult {
  groups: SubjectAttendanceGroup[];
  /** Same treatment as General Attendance's identical case — two rows in the same file targeting the same subject+class+date+student is a blocking error, not a silent last-write-wins. */
  duplicateErrors: RowError[];
}

/**
 * Groups resolved rows by (subjectId, classId, sessionDate) into the
 * records-map shape one SubjectAttendanceDoc actually has. Rows whose
 * class has no ClassTermInfo entry are skipped (already reported by
 * validateSubjectAttendanceDates, which must run first).
 */
export function groupSubjectAttendanceRows(
  rows: { row: ResolvedSubjectAttendanceImportRow; rowNumber: number }[],
  classTermById: Map<string, ClassTermInfo>,
): GroupRowsResult {
  const groupsByKey = new Map<string, SubjectAttendanceGroup>();
  const seenByGroupKey = new Map<string, Map<string, number>>();
  const duplicateErrors: RowError[] = [];

  for (const { row, rowNumber } of rows) {
    const info = classTermById.get(row.classId);
    if (!info) continue;

    const groupKey = `${row.subjectId}::${row.classId}::${row.date}`;
    let group = groupsByKey.get(groupKey);
    if (!group) {
      group = {
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        classId: row.classId,
        className: row.className,
        sessionDate: row.date,
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
        message: `duplicate entry for "${row.studentName}" on ${row.date} in "${row.subjectName}" / "${row.className}" (already set on row ${seen.get(row.studentId)})`,
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

// ─── Write shape (§10) ──────────────────────────────────────────────────────

export interface SubjectAttendanceWriteContext {
  institutionId: string;
  /** The importing user's own uid — matches commitSave's teacherId/submittedBy (§2: always self-attributed). */
  teacherId: string;
}

/**
 * One group's document data — matches commitSave's field shape
 * (attendance/subject/index.tsx), except `records` here is only the
 * group's covered students (merge:true leaves the rest of an existing
 * day's records untouched, same as General Attendance), and `createdAt`
 * is omitted entirely on a merge into an existing document.
 */
export function buildSubjectAttendanceData(
  group: SubjectAttendanceGroup,
  ctx: SubjectAttendanceWriteContext,
  isUpdate: boolean,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    institutionId: ctx.institutionId,
    subjectId: group.subjectId,
    subjectName: group.subjectName,
    classId: group.classId,
    className: group.className,
    sessionDate: group.sessionDate,
    teacherId: ctx.teacherId,
    termId: group.termId,
    academicYearId: group.academicYearId,
    records: group.records,
    submittedBy: ctx.teacherId,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (!isUpdate) data.createdAt = serverTimestamp();
  return data;
}
