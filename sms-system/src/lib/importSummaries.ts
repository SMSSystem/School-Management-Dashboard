import {
  validateGradebookScores,
  findGradebookDuplicateRows,
  type GradebookTargetContext,
  type GradebookColumnInfo,
  type ResolvedGradebookImportRow,
} from "@/lib/importGradebook";
import {
  validateGeneralAttendanceDates,
  groupGeneralAttendanceRows,
  type ResolvedGeneralAttendanceImportRow,
  type GeneralAttendanceGroup,
} from "@/lib/importGeneralAttendance";
import {
  validateSubjectAttendanceDates,
  groupSubjectAttendanceRows,
  type ResolvedSubjectAttendanceImportRow,
  type SubjectAttendanceGroup,
} from "@/lib/importSubjectAttendance";
import type { RowError } from "@/lib/spreadsheetImport";
import type { Row } from "@/lib/importConfig";
import {
  fetchClassTermInfo,
  fetchExistingGeneralAttendanceDocs,
  fetchExistingSubjectAttendanceDocs,
  fetchGradebookExistingResults,
} from "@/lib/importFetch";

// What the Import page checks and reads between resolving a file's names and showing its summary
// (scenes/(dashboard)/import): the checks that need resolved data, which documents already exist to update
// or merge into, and how many will be created or updated. Each returns the errors that send the person back
// to the upload step, or what the summary needs; the page keeps every state update.

export async function summariseGradebookImport({
  institutionId,
  gradebookContext,
  gradebookColumnsById,
  resolved,
  resolvedRowNumbers,
}: {
  institutionId: string;
  gradebookContext: GradebookTargetContext;
  gradebookColumnsById: Map<string, GradebookColumnInfo>;
  resolved: Row[];
  resolvedRowNumbers: number[];
}): Promise<{ errors: RowError[] } | { existingMap: Map<string, string>; creates: number; updates: number }> {
    const paired = resolved.map((row, i) => ({
      row: row as unknown as ResolvedGradebookImportRow,
      rowNumber: resolvedRowNumbers[i],
    }));
    const scoreErrors = validateGradebookScores(paired, gradebookColumnsById);
    if (scoreErrors.length > 0) return { errors: scoreErrors };

    const duplicateErrors = findGradebookDuplicateRows(paired);
    if (duplicateErrors.length > 0) return { errors: duplicateErrors };

    // Create-vs-update (§8): dedup key is (gradebookColumnId, studentId),
    // same as performSave — fetch this gradebook's existing results once
    // rather than querying per row.
    const existingMap = await fetchGradebookExistingResults(
      institutionId,
      gradebookContext.classId,
      gradebookContext.subjectId,
      gradebookContext.termId,
    );

    let creates = 0;
    let updates = 0;
    resolved.forEach((row) => {
      const key = `${row.studentId as string}::${row.columnId as string}`;
      if (existingMap.has(key)) updates += 1;
      else creates += 1;
    });
  return { existingMap, creates, updates };
}

export async function summariseGeneralAttendanceImport({
  institutionId,
  resolved,
  resolvedRowNumbers,
}: {
  institutionId: string;
  resolved: Row[];
  resolvedRowNumbers: number[];
}): Promise<
  { errors: RowError[] } | { groups: GeneralAttendanceGroup[]; existingMap: Map<string, string>; creates: number; updates: number }
> {
    const gaRows = resolved as unknown as ResolvedGeneralAttendanceImportRow[];
    const distinctClassIds = Array.from(new Set(gaRows.map((r) => r.classId)));
    const classTermById = await fetchClassTermInfo(institutionId, distinctClassIds);

    const paired = gaRows.map((row, i) => ({ row, rowNumber: resolvedRowNumbers[i] }));
    const dateErrors = validateGeneralAttendanceDates(paired, classTermById);
    if (dateErrors.length > 0) return { errors: dateErrors };

    const { groups, duplicateErrors } = groupGeneralAttendanceRows(paired, classTermById);
    if (duplicateErrors.length > 0) return { errors: duplicateErrors };

    const existingMap = await fetchExistingGeneralAttendanceDocs(institutionId, groups);
    let creates = 0;
    let updates = 0;
    groups.forEach((g) => {
      if (existingMap.has(`${g.classId}::${g.date}::${g.session}`)) updates += 1;
      else creates += 1;
    });
  return { groups, existingMap, creates, updates };
}

export async function summariseSubjectAttendanceImport({
  institutionId,
  resolved,
  resolvedRowNumbers,
}: {
  institutionId: string;
  resolved: Row[];
  resolvedRowNumbers: number[];
}): Promise<
  { errors: RowError[] } | { groups: SubjectAttendanceGroup[]; existingMap: Map<string, string>; creates: number; updates: number }
> {
    const saRows = resolved as unknown as ResolvedSubjectAttendanceImportRow[];
    const distinctClassIds = Array.from(new Set(saRows.map((r) => r.classId)));
    // fetchClassTermInfo is target-agnostic — reused as-is from General Attendance's wiring (§10 derives term the same way §9 does).
    const classTermById = await fetchClassTermInfo(institutionId, distinctClassIds);

    const paired = saRows.map((row, i) => ({ row, rowNumber: resolvedRowNumbers[i] }));
    const dateErrors = validateSubjectAttendanceDates(paired, classTermById);
    if (dateErrors.length > 0) return { errors: dateErrors };

    const { groups, duplicateErrors } = groupSubjectAttendanceRows(paired, classTermById);
    if (duplicateErrors.length > 0) return { errors: duplicateErrors };

    const existingMap = await fetchExistingSubjectAttendanceDocs(institutionId, groups);
    let creates = 0;
    let updates = 0;
    groups.forEach((g) => {
      if (existingMap.has(`${g.subjectId}::${g.classId}::${g.sessionDate}`)) updates += 1;
      else creates += 1;
    });
  return { groups, existingMap, creates, updates };
}
