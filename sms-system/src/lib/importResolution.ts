import type { Role } from "@/types/people";
import type { IdentityResolver } from "@/lib/spreadsheetImport";
import { buildGradebookIdentityResolvers, type GradebookIdentityCandidates, type GradebookTargetContext } from "@/lib/importGradebook";
import { buildGeneralAttendanceIdentityResolvers } from "@/lib/importGeneralAttendance";
import { buildSubjectAttendanceIdentityResolvers } from "@/lib/importSubjectAttendance";
import { buildStudentsIdentityResolvers } from "@/lib/importStudents";
import type { ResultWriteContext } from "@/lib/importResults";
import type { MddsWriteContext } from "@/lib/importMdds";
import { resolversFor, type Candidates, type Row, type TargetKey } from "@/lib/importConfig";
import {
  fetchCandidatesFor,
  fetchGeneralAttendanceCandidates,
  fetchGradebookStudentCandidates,
  fetchStudentsCandidates,
  fetchSubjectAttendanceCandidates,
  fetchWriteContextFor,
} from "@/lib/importFetch";

// The candidate lists and name resolvers an uploaded file is matched against, per target
// (scenes/(dashboard)/import). Returns null for a Gradebook import that has not been set up. The page
// stores what comes back and runs the resolution.
export async function prepareImportResolution({
  target,
  institutionId,
  role,
  uid,
  displayName,
  gradebookContext,
  gradebookColumnCandidates,
}: {
  target: TargetKey;
  institutionId: string;
  role: Role;
  uid: string;
  displayName: string | null;
  gradebookContext: GradebookTargetContext | null;
  gradebookColumnCandidates: { id: string; name: string }[];
}): Promise<{
  candidates: Candidates;
  resolvers: IdentityResolver<Row>[];
  writeContext?: ResultWriteContext | MddsWriteContext;
} | null> {
  if (target === "gradebook") {
    if (!gradebookContext) return null;
    const students = await fetchGradebookStudentCandidates(institutionId, gradebookContext.classId);
    const gbCandidates: GradebookIdentityCandidates = { students, columns: gradebookColumnCandidates };
    const builtResolvers = buildGradebookIdentityResolvers(gbCandidates) as unknown as IdentityResolver<Row>[];
    return { candidates: gbCandidates, resolvers: builtResolvers };
  }

  if (target === "general_attendance") {
    const gaCandidates = await fetchGeneralAttendanceCandidates(institutionId, role, uid);
    const builtResolvers = buildGeneralAttendanceIdentityResolvers(gaCandidates) as unknown as IdentityResolver<Row>[];
    return { candidates: gaCandidates, resolvers: builtResolvers };
  }

  if (target === "subject_attendance") {
    const saCandidates = await fetchSubjectAttendanceCandidates(institutionId, role, uid);
    const builtResolvers = buildSubjectAttendanceIdentityResolvers(saCandidates) as unknown as IdentityResolver<Row>[];
    return { candidates: saCandidates, resolvers: builtResolvers };
  }

  if (target === "students") {
    const studentsCandidates = await fetchStudentsCandidates(institutionId);
    const builtResolvers = buildStudentsIdentityResolvers(studentsCandidates) as unknown as IdentityResolver<Row>[];
    return { candidates: studentsCandidates, resolvers: builtResolvers };
  }

  const fetchedCandidates = await fetchCandidatesFor(target, institutionId, role, uid);
  const fetchedCtx = await fetchWriteContextFor(target, institutionId, uid, displayName, role);
  return { candidates: fetchedCandidates, resolvers: resolversFor(target, fetchedCandidates), writeContext: fetchedCtx };
}
