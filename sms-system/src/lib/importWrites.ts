import { doc } from "firebase/firestore";
import { generalRegisterId, subjectRegisterId } from "@/lib/attendanceRegisters";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import type { PendingWrite } from "@/lib/spreadsheetImport";
import {
  buildGradebookCreateData,
  buildGradebookUpdateData,
  type GradebookColumnInfo,
  type GradebookWriteContext,
  type ResolvedGradebookImportRow,
} from "@/lib/importGradebook";
import { buildGeneralAttendanceData, type GeneralAttendanceGroup } from "@/lib/importGeneralAttendance";
import { buildSubjectAttendanceData, type SubjectAttendanceGroup } from "@/lib/importSubjectAttendance";
import { TARGET_COLLECTION, buildDataFor, type Row, type TargetKey } from "@/lib/importConfig";

// What an import writes (scenes/(dashboard)/import): the list of documents a confirmed import will create or
// merge into, per target, and the rows each one came from (for the failed-rows report).

/** Gradebook and the two attendance targets create or merge into what exists; the rest create new documents. */
export function buildPendingWrites({
  target,
  institutionId,
  userUid,
  resolvedRows,
  gaGroups,
  gaExistingDocIds,
  saGroups,
  saExistingDocIds,
  gradebookColumnsById,
  existingResultIds,
  gradebookWriteContext,
  writeContext,
}: {
  target: Exclude<TargetKey, "students">;
  institutionId: string;
  userUid: string | undefined;
  resolvedRows: Row[];
  gaGroups: GeneralAttendanceGroup[];
  gaExistingDocIds: Map<string, string>;
  saGroups: SubjectAttendanceGroup[];
  saExistingDocIds: Map<string, string>;
  gradebookColumnsById: Map<string, GradebookColumnInfo>;
  existingResultIds: Map<string, string>;
  gradebookWriteContext: GradebookWriteContext | null;
  writeContext: unknown;
}): PendingWrite[] {
  return (
        target === "gradebook"
          ? resolvedRows.map((row) => {
              const gRow = row as unknown as ResolvedGradebookImportRow;
              const column = gradebookColumnsById.get(gRow.columnId)!;
              const existingId = existingResultIds.get(`${gRow.studentId}::${gRow.columnId}`);
              if (existingId) {
                return {
                  ref: institutionDoc(institutionId, "results", existingId),
                  data: buildGradebookUpdateData(gRow, column),
                  merge: true,
                };
              }
              return {
                ref: doc(institutionCollection(institutionId, "results")),
                data: buildGradebookCreateData(gRow, column, gradebookWriteContext!),
              };
            })
          : target === "general_attendance"
            ? gaGroups.map((g) => {
                const existingId = gaExistingDocIds.get(`${g.classId}::${g.date}::${g.session}`);
                const ctx = { institutionId, submittedBy: userUid! };
                if (existingId) {
                  return {
                    ref: institutionDoc(institutionId, "generalAttendance", existingId),
                    data: buildGeneralAttendanceData(g, ctx, true),
                    merge: true,
                  };
                }
                return {
                  ref: institutionDoc(institutionId, "generalAttendance", generalRegisterId(g.classId, g.date, g.session)),
                  data: buildGeneralAttendanceData(g, ctx, false),
                  merge: true,
                };
              })
            : target === "subject_attendance"
              ? saGroups.map((g) => {
                  const existingId = saExistingDocIds.get(`${g.subjectId}::${g.classId}::${g.sessionDate}`);
                  const ctx = { institutionId, teacherId: userUid! };
                  if (existingId) {
                    return {
                      ref: institutionDoc(institutionId, "subjectAttendance", existingId),
                      data: buildSubjectAttendanceData(g, ctx, true),
                      merge: true,
                    };
                  }
                  return {
                    ref: institutionDoc(institutionId, "subjectAttendance", subjectRegisterId(g.subjectId, g.classId, g.sessionDate)),
                    data: buildSubjectAttendanceData(g, ctx, false),
                    merge: true,
                  };
                })
              : resolvedRows.map((row) => ({
                  ref: doc(institutionCollection(institutionId, TARGET_COLLECTION[target])),
                  data: buildDataFor(target, row, writeContext),
                }))
  );
}

/** The rows or groups the pending writes were built from, to rebuild which entries a failed chunk covered. */
export function writeSourceRowsFor(
  target: Exclude<TargetKey, "students">,
  gaGroups: GeneralAttendanceGroup[],
  saGroups: SubjectAttendanceGroup[],
  resolvedRows: Row[],
): Row[] {
  return (
    target === "general_attendance" ? (gaGroups as unknown as Row[])
    : target === "subject_attendance" ? (saGroups as unknown as Row[])
    : resolvedRows
  );
}
