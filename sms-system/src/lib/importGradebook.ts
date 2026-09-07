import { serverTimestamp } from 'firebase/firestore';
import {
  parseRequiredString,
  parseNumberCell,
  matchByName,
  type ImportColumn,
  type IdentityResolver,
  type ValidationRule,
  type NameCandidate,
  type RowError,
} from './spreadsheetImport';

// Target-specific piece of the import feature for Gradebook (§8 of
// SPREADSHEET_IMPORT_SPEC.md) — §17 step 5, "introduces the create-vs-
// update dual behavior." Firebase-free, same as importResults.ts/
// importMdds.ts — fetching candidates and attaching Firestore refs is the
// shared import UI's job.
//
// Unlike Results/MDDS, Gradebook is scoped to exactly one gradebook per
// import (one Class+Subject+Term, picked up front by the UI before
// upload) — a gradebook column only exists inside one specific
// (classId, subjectId, termId) triple (deterministic doc id
// `${classId}_${subjectId}_${termId}`, per list/gradebook/index.tsx), so
// "Column" can't be resolved with a single institution-wide query the way
// Student/Class/Subject/Term are for Results/MDDS. Class/Subject/Term
// stay as required spreadsheet columns (§8) but are validated against the
// single pre-selected gradebook rather than independently resolved to
// arbitrary ids — see buildGradebookContextRules.

export interface GradebookImportRow {
  studentName: string;
  className: string;
  subjectName: string;
  termName: string;
  columnLabel: string;
  score: number;
  // Filled in by resolveIdentities (spreadsheetImport.ts).
  studentId?: string;
  columnId?: string;
}

export type ResolvedGradebookImportRow = GradebookImportRow &
  Required<Pick<GradebookImportRow, 'studentId' | 'columnId'>>;

// ─── Column definitions (§8 required columns) ─────────────────────────────

export const gradebookImportColumns: ImportColumn<GradebookImportRow>[] = [
  { header: 'Student', required: true, field: 'studentName', parse: parseRequiredString },
  { header: 'Class', required: true, field: 'className', parse: parseRequiredString },
  { header: 'Subject', required: true, field: 'subjectName', parse: parseRequiredString },
  { header: 'Term', required: true, field: 'termName', parse: parseRequiredString },
  { header: 'Column', required: true, field: 'columnLabel', parse: parseRequiredString },
  { header: 'Score', required: true, field: 'score', parse: (raw) => parseNumberCell(raw, 'score') },
];

// ─── Business-rule validation ──────────────────────────────────────────────

export interface GradebookTargetContext {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  termId: string;
  termName: string;
}

/**
 * v1 supports one gradebook per import (see module comment), so every row's
 * Class/Subject/Term must name the single pre-selected gradebook — not an
 * identity column resolved independently per row like Results/MDDS. Same
 * case-insensitive/trimmed compare §3 uses for name matching.
 */
export function buildGradebookContextRules(ctx: GradebookTargetContext): ValidationRule<GradebookImportRow>[] {
  const norm = (s: string) => s.trim().toLowerCase();
  return [
    {
      check: (row) => norm(row.className) === norm(ctx.className),
      message: (row) => `Class "${row.className}" doesn't match the selected gradebook's class ("${ctx.className}")`,
    },
    {
      check: (row) => norm(row.subjectName) === norm(ctx.subjectName),
      message: (row) => `Subject "${row.subjectName}" doesn't match the selected gradebook's subject ("${ctx.subjectName}")`,
    },
    {
      check: (row) => norm(row.termName) === norm(ctx.termName),
      message: (row) => `Term "${row.termName}" doesn't match the selected gradebook's term ("${ctx.termName}")`,
    },
  ];
}

// ─── Identity resolution (§3, §8) ─────────────────────────────────────────

export interface GradebookIdentityCandidates {
  /** Students in the pre-selected class only — mirrors performSave's own class-scoped student query. */
  students: NameCandidate[];
  /** This one gradebook's columns subcollection, by label. */
  columns: NameCandidate[];
}

export function buildGradebookIdentityResolvers(
  candidates: GradebookIdentityCandidates,
): IdentityResolver<GradebookImportRow>[] {
  return [
    {
      column: 'studentName',
      label: 'Student',
      resolvedField: 'studentId',
      lookup: async (raw) => matchByName(candidates.students, raw),
    },
    {
      column: 'columnLabel',
      label: 'Column',
      resolvedField: 'columnId',
      lookup: async (raw) => matchByName(candidates.columns, raw),
    },
  ];
}

// ─── Score validation against the resolved column's maxScore ─────────────

export interface GradebookColumnInfo {
  id: string;
  label: string;
  maxScore: number;
  columnWeight: number;
  assessmentType: 'coursework' | 'exam';
  date?: string;
}

/**
 * Mirrors performSave's own pre-batch check (gradebook/index.tsx): no
 * score may exceed its column's maxScore. Runs after identity resolution,
 * unlike Results/MDDS's rules, because maxScore comes from the resolved
 * column (§8), not the spreadsheet. Takes rows paired with their original
 * spreadsheet row number rather than relying on array position, since
 * rows may have been reordered/filtered by manual identity-resolution
 * decisions (skipped ambiguous values) upstream of this call.
 */
export function validateGradebookScores(
  rows: { row: ResolvedGradebookImportRow; rowNumber: number }[],
  columnsById: Map<string, GradebookColumnInfo>,
): RowError[] {
  const errors: RowError[] = [];
  for (const { row, rowNumber } of rows) {
    const col = columnsById.get(row.columnId);
    if (!col) continue; // shouldn't happen — columnId came from resolving against this same map
    if (row.score > col.maxScore) {
      errors.push({
        row: rowNumber,
        message: `score (${row.score}) exceeds max score (${col.maxScore}) for column "${col.label}"`,
      });
    }
  }
  return errors;
}

// ─── Write shape (§8) — the create-vs-update dual behavior ───────────────

export interface GradebookWriteContext {
  institutionId: string;
  classId: string;
  className: string;
  subjectId: string;
  termId: string;
  /** The importing user's own uid — every import is self-attributed, never on behalf of another teacher (§2). */
  teacherId: string;
  /** From the subject document's own teacherNames[0], not the importing user's name — matches performSave exactly. */
  teacherName: string;
  /** From the subject document's departmentId, not the importing user's own — matches performSave exactly. */
  departmentId: string;
}

/**
 * New-result fields — matches performSave's create branch exactly,
 * including its quirk of storing the column's id (not its label) as
 * assessmentName, so imported cells stay indistinguishable from ones
 * entered directly in the Gradebook grid.
 */
export function buildGradebookCreateData(
  row: ResolvedGradebookImportRow,
  column: GradebookColumnInfo,
  ctx: GradebookWriteContext,
): Record<string, unknown> {
  return {
    studentId: row.studentId,
    studentName: row.studentName,
    classId: ctx.classId,
    className: ctx.className,
    termId: ctx.termId,
    institutionId: ctx.institutionId,
    subjectId: ctx.subjectId,
    assessmentName: column.id,
    assessmentType: column.assessmentType,
    score: row.score,
    maxScore: column.maxScore,
    weight: column.columnWeight,
    date: column.date ?? '',
    gradebookColumnId: column.id,
    columnWeight: column.columnWeight,
    source: 'gradebook',
    teacherId: ctx.teacherId,
    teacherName: ctx.teacherName,
    departmentId: ctx.departmentId,
    createdAt: serverTimestamp(),
  };
}

/**
 * Existing-result update fields — matches performSave's update branch
 * exactly: only the substantive grading fields are touched, leaving
 * studentId/classId/termId/etc. (locked context) untouched, same
 * omit-nothing-else convention as ResultForm.tsx/DisciplinaryActionForm.tsx's
 * own update paths.
 */
export function buildGradebookUpdateData(
  row: ResolvedGradebookImportRow,
  column: GradebookColumnInfo,
): Record<string, unknown> {
  return {
    score: row.score,
    maxScore: column.maxScore,
    assessmentType: column.assessmentType,
    columnWeight: column.columnWeight,
    weight: column.columnWeight,
  };
}
