import { FirebaseError } from "firebase/app";
import type { Role } from "@/types/people";
import { ROLE_DEFAULT_PASSWORDS } from "@/lib/roleDefaultPasswords";
import type { ExportColumn } from "@/lib/spreadsheetExport";
import type { ImportColumn, IdentityResolver, ValidationRule } from "@/lib/spreadsheetImport";
import {
  resultsImportColumns,
  resultsImportExampleRow,
  resultsValidationRules,
  buildResultsIdentityResolvers,
  buildResultData,
  resultDuplicateKey,
  type ResultsIdentityCandidates,
  type ResolvedResultImportRow,
  type ResultWriteContext,
} from "@/lib/importResults";
import {
  mddsImportColumns,
  mddsImportExampleRow,
  mddsValidationRules,
  buildMddsIdentityResolvers,
  buildMddsData,
  mddsDuplicateKey,
  type MddsIdentityCandidates,
  type ResolvedMddsImportRow,
  type MddsWriteContext,
} from "@/lib/importMdds";
import {
  gradebookImportColumns,
  gradebookImportExampleRow,
  buildGradebookContextRules,
  type GradebookIdentityCandidates,
  type GradebookTargetContext,
} from "@/lib/importGradebook";
import {
  generalAttendanceImportColumns,
  generalAttendanceImportExampleRow,
  generalAttendanceValidationRules,
  type GeneralAttendanceIdentityCandidates,
} from "@/lib/importGeneralAttendance";
import {
  subjectAttendanceImportColumns,
  subjectAttendanceImportExampleRow,
  subjectAttendanceValidationRules,
  type SubjectAttendanceIdentityCandidates,
} from "@/lib/importSubjectAttendance";
import {
  studentsImportColumns,
  studentsImportExampleRow,
  studentsValidationRules,
  type StudentsIdentityCandidates,
} from "@/lib/importStudents";

// The Import page's configuration and the rules that need no screen or database
// (scenes/(dashboard)/import): the six targets, who may use each, the caps, each target's columns and
// help text, the wording of account-creation errors, and the per-target lookups the wizard uses.

export type TargetKey = "results" | "mdds" | "gradebook" | "general_attendance" | "subject_attendance" | "students";
export type Row = Record<string, unknown>;
export type Candidates =
  | ResultsIdentityCandidates
  | MddsIdentityCandidates
  | GradebookIdentityCandidates
  | GeneralAttendanceIdentityCandidates
  | SubjectAttendanceIdentityCandidates
  | StudentsIdentityCandidates;

export const IMPLEMENTED_TARGETS: { key: TargetKey; label: string }[] = [
  { key: "results", label: "Results" },
  { key: "mdds", label: "MDDS (Disciplinary Actions)" },
  { key: "gradebook", label: "Gradebook" },
  { key: "general_attendance", label: "General Attendance" },
  { key: "subject_attendance", label: "Subject Attendance" },
  { key: "students", label: "Students" },
];
// All 5 domains §5 step 1 describes, plus the 6th (Students) added per
// docs/miscellaneous-specs/SPREADSHEET_IMPORT_STUDENTS_SPEC.md, are now
// implemented.
export const PLANNED_TARGETS: string[] = [];

// §11's table — Results/MDDS/Gradebook share the same 4 roles (their rules
// use isAdminOrAbove(), which includes super_admin). General Attendance
// excludes regular_teacher entirely; Subject Attendance is the inverse — it
// excludes senior_teacher entirely (per firestore.rules' subjectAttendance
// create/update check: isAdmin() or a subject-scoped regular_teacher, no
// senior_teacher branch at all).
//
// CORRECTED (code review before opening the PR): both Attendance targets'
// create/update rules gate on bare isAdmin() (institution_admin only), not
// isAdminOrAbove() — unlike every other target here, super_admin is
// structurally excluded from writing generalAttendance/subjectAttendance,
// despite §11's own table (and this list, previously) claiming otherwise.
// Confirmed directly against firestore.rules' institutions/{id}/
// generalAttendance and institutions/{id}/subjectAttendance create/update
// blocks, not assumed from the spec. In today's app this has no live
// effect either way — AuthContext always sets super_admin's institutionId
// to the SUPER_ADMIN_SENTINEL, and this page's own top-level guard never
// lets super_admin reach target selection at all — but the list should
// still say what the rule actually allows, not what the spec assumed it
// did, in case that changes later.
// Students is the one target that excludes both teacher roles — unlike
// every other target here, creating an account is gated by firestore.rules'
// users create rule on isAdmin()/isSuperAdmin() specifically, not
// isAdminOrAbove()/isTeacherOrAbove(). See SPREADSHEET_IMPORT_STUDENTS_SPEC.md
// §Design Decisions.
export const TARGET_ALLOWED_ROLES: Record<TargetKey, Role[]> = {
  results: ["institution_admin", "super_admin", "senior_teacher", "regular_teacher"],
  mdds: ["institution_admin", "super_admin", "senior_teacher", "regular_teacher"],
  gradebook: ["institution_admin", "super_admin", "senior_teacher", "regular_teacher"],
  general_attendance: ["institution_admin", "senior_teacher"],
  subject_attendance: ["institution_admin", "regular_teacher"],
  students: ["institution_admin", "super_admin"],
};

export const TARGET_COLLECTION: Record<"results" | "mdds", string> = {
  results: "results",
  mdds: "disciplinaryActions",
};

// §2's hard cap — 10% of the 20,000-writes/day Spark quota (§12). For
// General Attendance this is checked against the post-grouping document
// count, not the raw row count, per §12's own note. Doesn't apply to
// Students — see STUDENTS_IMPORT_CAP below, a much smaller, differently
// motivated limit.
export const IMPORT_WRITE_CAP = 2000;

// Firebase enforces a hard 100-accounts-per-hour-per-IP ceiling on
// client-side account creation, with no workaround short of a server-side
// Admin SDK this app doesn't have. 90 leaves headroom for any other
// account creation (this feature or the ordinary Create Account page)
// happening from the same network in the same hour. See
// SPREADSHEET_IMPORT_STUDENTS_SPEC.md §Design Decisions and
// §Rate-Limit/Operational Considerations.
export const STUDENTS_IMPORT_CAP = 90;

// Visible in the client bundle — see SPREADSHEET_IMPORT_STUDENTS_SPEC.md
// §Security Considerations for the accepted tradeoff this represents (bounded
// by the forced-password-change gate every imported account is created
// with, not eliminated). Every imported student shares this one password
// until their first sign-in.
export const SHARED_STUDENT_IMPORT_PASSWORD = ROLE_DEFAULT_PASSWORDS.student as string;

export function columnsFor(target: TargetKey): ImportColumn<Row>[] {
  const cols =
    target === "results" ? resultsImportColumns
    : target === "mdds" ? mddsImportColumns
    : target === "gradebook" ? gradebookImportColumns
    : target === "general_attendance" ? generalAttendanceImportColumns
    : target === "subject_attendance" ? subjectAttendanceImportColumns
    : studentsImportColumns;
  return cols as unknown as ImportColumn<Row>[];
}

export function exampleRowFor(target: TargetKey): Record<string, string | number> {
  return target === "results" ? resultsImportExampleRow
    : target === "mdds" ? mddsImportExampleRow
    : target === "gradebook" ? gradebookImportExampleRow
    : target === "general_attendance" ? generalAttendanceImportExampleRow
    : target === "subject_attendance" ? subjectAttendanceImportExampleRow
    : studentsImportExampleRow;
}

// §13's inline guidance — which columns are identity columns (§3), valid
// enum values, and (Attendance only) the merge-not-overwrite behavior
// (§9, §10), the one behavior most likely to surprise someone who doesn't
// read a manual first.
export const TARGET_IDENTITY_COLUMNS: Record<TargetKey, string[]> = {
  results: ["Student", "Class", "Subject", "Term"],
  mdds: ["Student", "Class", "Term"],
  gradebook: ["Student", "Column"],
  general_attendance: ["Class", "Student"],
  subject_attendance: ["Subject", "Class", "Student"],
  students: ["Class", "Additional Classes", "House"],
};

export const TARGET_ENUM_HELP: Record<TargetKey, string | null> = {
  results: 'Type must be "coursework" or "exam".',
  mdds: 'Type must be "merit", "demerit", "detention", or "suspension".',
  gradebook: null,
  general_attendance: 'Session must be "AM" or "PM". State must be one of P/A/L/S/E/B (Present/Absent/Late/Sick/Excused/Blank).',
  subject_attendance: "State must be one of P/A/L/S/E/B (Present/Absent/Late/Sick/Excused/Blank).",
  students: 'Gender, if given, must be "Male" or "Female".',
};

// Students-only: unlike every other target's identity columns (all
// required), Class/House are optional — a blank value just means "no class/
// house assigned yet, set it later from the student's own edit screen,"
// not "needs manual resolution." Shown alongside TARGET_IDENTITY_COLUMNS'
// generic copy on the upload step.
export const STUDENTS_IDENTITY_OPTIONAL_NOTE =
  "Class, Additional Classes and House are optional — leave any blank to skip assigning it at import time. Additional Classes takes class names separated by a semicolon (for example Grade 10B; Grade 11A) and needs a Class too; the student takes every subject of each.";

export const ATTENDANCE_MERGE_NOTE =
  "If a document already exists for that class/date (and subject, for Subject Attendance), the import only fills in the students listed in your file — it never erases students already marked through the normal register.";

// Students-only — every other target's writes go through
// chunkedBatchWrite's own generic error handling, but Auth account
// creation (createUserWithEmailAndPassword/deleteUser) can throw
// FirebaseErrors chunkedBatchWrite never sees. Mirrors
// AdminCreateUserForm.tsx's own getFirebaseMessage, with codes relevant to
// bulk account creation specifically (auth/too-many-requests in
// particular — the 100/hour/IP ceiling this feature is built around).
export function getImportAccountMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return "Something went wrong while creating this account.";
  }
  const messages: Record<string, string> = {
    "auth/email-already-in-use": "That email already belongs to another account.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password should be at least 8 characters.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/too-many-requests":
      "Too many accounts created recently — Firebase allows at most 100 new accounts per hour from this network. Wait and try again later.",
    "permission-denied": "Firestore denied this write. Check your security rules for admin user creation.",
  };
  return messages[error.code] ?? error.message;
}

export function resolversFor(target: "results" | "mdds", candidates: unknown): IdentityResolver<Row>[] {
  return (
    target === "results"
      ? buildResultsIdentityResolvers(candidates as ResultsIdentityCandidates)
      : buildMddsIdentityResolvers(candidates as MddsIdentityCandidates)
  ) as unknown as IdentityResolver<Row>[];
}

export function duplicateKeyFor(target: "results" | "mdds", row: Row): string {
  return target === "results"
    ? resultDuplicateKey(row as unknown as Parameters<typeof resultDuplicateKey>[0])
    : mddsDuplicateKey(row as unknown as Parameters<typeof mddsDuplicateKey>[0]);
}

export function buildDataFor(target: "results" | "mdds", row: Row, ctx: unknown): Record<string, unknown> {
  return target === "results"
    ? buildResultData(row as unknown as ResolvedResultImportRow, ctx as ResultWriteContext)
    : buildMddsData(row as unknown as ResolvedMddsImportRow, ctx as MddsWriteContext);
}

export interface GaRebuildProgress {
  done: number;
  total: number;
  students: number;
}

export type Decision = { selectedId: string } | { skip: true };

export function decisionKey(column: string, value: string): string {
  return `${column}::${value}`;
}

export type Step = "target" | "gradebook-setup" | "upload" | "resolve" | "summary" | "committing" | "done";

/** The candidates a value can be resolved against, keyed by the column it came from (the resolve step's dropdowns). */
export function candidatesByColumnFor(
  target: TargetKey | null,
  candidates: Candidates | null,
): Record<string, { id: string; name: string }[]> {
  if (!candidates || !target) return {} as Record<string, { id: string; name: string }[]>;
  if (target === "mdds") {
    const c = candidates as MddsIdentityCandidates;
    return { Student: c.students, Class: c.classes, Term: c.terms };
  }
  if (target === "gradebook") {
    const c = candidates as GradebookIdentityCandidates;
    return { Student: c.students, Column: c.columns };
  }
  if (target === "general_attendance") {
    const c = candidates as GeneralAttendanceIdentityCandidates;
    return { Student: c.students, Class: c.classes };
  }
  if (target === "subject_attendance") {
    const c = candidates as SubjectAttendanceIdentityCandidates;
    return { Student: c.students, Class: c.classes, Subject: c.subjects };
  }
  if (target === "students") {
    const c = candidates as StudentsIdentityCandidates;
    return { Class: c.classes, House: c.houses };
  }
  const c = candidates as ResultsIdentityCandidates;
  return { Student: c.students, Class: c.classes, Subject: c.subjects, Term: c.terms };
}

/** The columns of the downloadable report of rows that failed to commit, per target. */
export function errorReportColumnsFor(target: TargetKey): ExportColumn<Row & { __error: string }>[] {
  return target === "results"
    ? [
        { header: "Student", accessor: (r) => r.studentName as string },
        { header: "Class", accessor: (r) => r.className as string },
        { header: "Subject", accessor: (r) => r.subjectName as string },
        { header: "Term", accessor: (r) => r.termName as string },
        { header: "Assessment", accessor: (r) => r.assessmentName as string },
        { header: "Error", accessor: (r) => r.__error },
      ]
    : target === "mdds"
      ? [
          { header: "Student", accessor: (r) => r.studentName as string },
          { header: "Class", accessor: (r) => r.className as string },
          { header: "Term", accessor: (r) => r.termName as string },
          { header: "Type", accessor: (r) => r.type as string },
          { header: "Date", accessor: (r) => r.date as string },
          { header: "Error", accessor: (r) => r.__error },
        ]
      : target === "gradebook"
        ? [
            { header: "Student", accessor: (r) => r.studentName as string },
            { header: "Column", accessor: (r) => r.columnLabel as string },
            { header: "Score", accessor: (r) => r.score as number },
            { header: "Error", accessor: (r) => r.__error },
          ]
        : target === "general_attendance"
          ? [
              { header: "Class", accessor: (r) => r.className as string },
              { header: "Date", accessor: (r) => r.date as string },
              { header: "Session", accessor: (r) => r.session as string },
              { header: "Error", accessor: (r) => r.__error },
            ]
          : target === "subject_attendance"
            ? [
                { header: "Subject", accessor: (r) => r.subjectName as string },
                { header: "Class", accessor: (r) => r.className as string },
                { header: "Date", accessor: (r) => r.sessionDate as string },
                { header: "Error", accessor: (r) => r.__error },
              ]
            : [
                { header: "First Name", accessor: (r) => r.firstName as string },
                { header: "Last Name", accessor: (r) => r.lastName as string },
                { header: "Email", accessor: (r) => r.email as string },
                { header: "Error", accessor: (r) => r.__error },
              ];
}

/**
 * The business rules a parsed file is checked against, per target. Run before the names are resolved: for
 * these rules validity does not depend on resolution, so a file-level mistake surfaces sooner. The
 * Gradebook's score check and both attendance targets' date and duplicate checks genuinely need resolved
 * data, so they run later (lib/importSummaries.ts).
 */
export function validationRulesFor(target: TargetKey, gradebookContext: GradebookTargetContext | null): ValidationRule<Row>[] {
  return target === "gradebook"
    ? (buildGradebookContextRules(gradebookContext!) as unknown as ValidationRule<Row>[])
    : target === "general_attendance"
      ? (generalAttendanceValidationRules as unknown as ValidationRule<Row>[])
      : target === "subject_attendance"
        ? (subjectAttendanceValidationRules as unknown as ValidationRule<Row>[])
        : target === "students"
          ? (studentsValidationRules as unknown as ValidationRule<Row>[])
          : ((target === "results" ? resultsValidationRules : mddsValidationRules) as unknown as ValidationRule<Row>[]);
}
