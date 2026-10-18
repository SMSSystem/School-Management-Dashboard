import { useMemo, useState } from "react";
import { db, getUserCreationAuth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import { invalidateUserCounts } from "@/lib/invalidateUserCounts";
import { SUPER_ADMIN_SENTINEL } from "@/lib/paths";
import { usePhoneCanonicalizer } from "@/hooks/usePhoneCanonicalizer";
import { downloadCSV } from "@/lib/spreadsheetExport";
import {
  IMPORT_WRITE_CAP,
  STUDENTS_IMPORT_CAP,
  columnsFor,
  duplicateKeyFor,
  candidatesByColumnFor,
  errorReportColumnsFor,
  validationRulesFor,
  decisionKey,
  type TargetKey,
  type Row,
  type Candidates,
  type Decision,
  type Step,
  type GaRebuildProgress,
} from "@/lib/importConfig";
import { TargetStep } from "./TargetStep";
import { GradebookSetupStep } from "./GradebookSetupStep";
import { UploadStep } from "./UploadStep";
import { ResolveStep } from "./ResolveStep";
import { SummaryStep } from "./SummaryStep";
import { DoneStep } from "./DoneStep";
import { runGeneralAttendanceRebuild as runAttendanceRebuild } from "@/lib/importAttendanceRebuild";
import { createImportedStudents } from "@/lib/importStudentsCommit";
import { buildPendingWrites, writeSourceRowsFor } from "@/lib/importWrites";
import {
  summariseGradebookImport,
  summariseGeneralAttendanceImport,
  summariseSubjectAttendanceImport,
} from "@/lib/importSummaries";
import { prepareImportResolution } from "@/lib/importResolution";
import {
  fetchGradebookSetupOptions,
  fetchGradebookSetup,
  fetchExistingKeysFor,
  fetchStudentsUniquenessConflicts,
} from "@/lib/importFetch";
import {
  parseSpreadsheetFile,
  validateStructure,
  parseRows,
  resolveIdentities,
  validateRows,
  chunkWrites,
  chunkedBatchWrite,
  countAdvisoryDuplicates,
  type RawRow,
  type RowError,
  type AmbiguousEntry,
  type IdentityResolver,
  type CommitProgress,
} from "@/lib/spreadsheetImport";
import {
  type ResultWriteContext,
} from "@/lib/importResults";
import {
  type MddsWriteContext,
} from "@/lib/importMdds";
import {
  type GradebookTargetContext,
  type GradebookColumnInfo,
  type GradebookWriteContext,
} from "@/lib/importGradebook";
import {
  type GeneralAttendanceGroup,
} from "@/lib/importGeneralAttendance";
import {
  type SubjectAttendanceGroup,
} from "@/lib/importSubjectAttendance";
import {
  type StudentsIdentityCandidates,
  type ResolvedStudentImportRow,
} from "@/lib/importStudents";

// The shared import UI (§5 of SPREADSHEET_IMPORT_SPEC.md) — §17 steps 4-7,
// "built against Results/MDDS first, then parameterized for the remaining
// targets." Still dispatches on a plain `target` string rather than a
// generic TargetConfig<Row> registry — Subject Attendance is a fourth
// data point confirming concrete per-target branching stays the right
// call: it reuses General Attendance's grouping/merge shape almost
// exactly (§10 says so explicitly), so the wiring below leans on that
// shared shape directly (fetchClassTermInfo, the merge/create write
// pattern) rather than routing it through any new abstraction.
//
// Template download (§5 step 2 / §13) — §17 step 8 — is wired in below via
// exampleRowFor()/downloadImportTemplate(), offered inline at the upload
// step per §5. Generated from the exact same columnsFor() every other step
// already validates against, so it can't drift from what upload actually
// accepts.

const ImportPage = () => {
  const { user, role, institutionId, displayName } = useAuth();
  const canonicalizePhone = usePhoneCanonicalizer();

  const [step, setStep] = useState<Step>("target");
  const [target, setTarget] = useState<TargetKey | null>(null);
  const [busy, setBusy] = useState(false);

  // Gradebook-only: the single Class/Subject/Term picked before upload (§8, per this session's scope decision).
  const [gbClasses, setGbClasses] = useState<{ id: string; name: string }[]>([]);
  const [gbSubjects, setGbSubjects] = useState<{ id: string; name: string }[]>([]);
  const [gbTerms, setGbTerms] = useState<{ id: string; name: string }[]>([]);
  const [gbClassId, setGbClassId] = useState("");
  const [gbSubjectId, setGbSubjectId] = useState("");
  const [gbTermId, setGbTermId] = useState("");
  const [gbSetupError, setGbSetupError] = useState<string | null>(null);
  const [gradebookContext, setGradebookContext] = useState<GradebookTargetContext | null>(null);
  const [gradebookWriteContext, setGradebookWriteContext] = useState<GradebookWriteContext | null>(null);
  const [gradebookColumnsById, setGradebookColumnsById] = useState<Map<string, GradebookColumnInfo>>(new Map());
  const [gradebookColumnCandidates, setGradebookColumnCandidates] = useState<{ id: string; name: string }[]>([]);
  const [existingResultIds, setExistingResultIds] = useState<Map<string, string>>(new Map());
  const [createCount, setCreateCount] = useState(0);
  const [updateCount, setUpdateCount] = useState(0);

  // General Attendance-only: post-grouping state.
  const [gaGroups, setGaGroups] = useState<GeneralAttendanceGroup[]>([]);
  const [gaExistingDocIds, setGaExistingDocIds] = useState<Map<string, string>>(new Map());
  const [gaRebuildProgress, setGaRebuildProgress] = useState<GaRebuildProgress | null>(null);
  const [gaRebuildDone, setGaRebuildDone] = useState(false);

  // Subject Attendance-only: post-grouping state (no rebuild step — §10).
  const [saGroups, setSaGroups] = useState<SubjectAttendanceGroup[]>([]);
  const [saExistingDocIds, setSaExistingDocIds] = useState<Map<string, string>>(new Map());

  const [fileError, setFileError] = useState<string | null>(null);
  const [structuralMissing, setStructuralMissing] = useState<string[]>([]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);

  const [parsedRows, setParsedRows] = useState<Row[]>([]);
  // Original spreadsheet row number (header = row 1) for each entry in
  // parsedRows/resolvedRows — kept in lockstep through skip-filtering
  // during manual identity resolution, so a post-resolution error
  // (Gradebook's score check, General Attendance's date/duplicate checks)
  // reports the row's real position in the uploaded file, not its
  // position in a possibly-shorter filtered array.
  const [rowNumbers, setRowNumbers] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<Candidates | null>(null);
  const [resolvers, setResolvers] = useState<IdentityResolver<Row>[]>([]);
  const [writeContext, setWriteContext] = useState<ResultWriteContext | MddsWriteContext | null>(null);

  const [needsResolution, setNeedsResolution] = useState<AmbiguousEntry[]>([]);
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [resolvedRows, setResolvedRows] = useState<Row[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);

  const [commitProgress, setCommitProgress] = useState<CommitProgress | null>(null);
  const [commitResult, setCommitResult] = useState<CommitProgress | null>(null);
  const [failedRows, setFailedRows] = useState<(Row & { __error: string })[]>([]);

  // Students-only — same secondary-Firebase-app pattern AdminCreateUserForm.tsx
  // already uses (and the same appName, so both files share one singleton
  // instance): a second Auth instance for createUserWithEmailAndPassword so
  // the importing admin's own session on the default `auth` instance is
  // never disturbed.
  const secondaryAuth = useMemo(() => getUserCreationAuth(), []);

  const candidatesByColumn = useMemo(() => candidatesByColumnFor(target, candidates), [candidates, target]);

  function resetAll() {
    setStep("target");
    setTarget(null);
    setGbClasses([]);
    setGbSubjects([]);
    setGbTerms([]);
    setGbClassId("");
    setGbSubjectId("");
    setGbTermId("");
    setGbSetupError(null);
    setGradebookContext(null);
    setGradebookWriteContext(null);
    setGradebookColumnsById(new Map());
    setGradebookColumnCandidates([]);
    setExistingResultIds(new Map());
    setCreateCount(0);
    setUpdateCount(0);
    setGaGroups([]);
    setGaExistingDocIds(new Map());
    setGaRebuildProgress(null);
    setGaRebuildDone(false);
    setSaGroups([]);
    setSaExistingDocIds(new Map());
    setFileError(null);
    setStructuralMissing([]);
    setRowErrors([]);
    setParsedRows([]);
    setRowNumbers([]);
    setCandidates(null);
    setResolvers([]);
    setWriteContext(null);
    setNeedsResolution([]);
    setDecisions(new Map());
    setResolveError(null);
    setResolvedRows([]);
    setDuplicateCount(0);
    setCommitProgress(null);
    setCommitResult(null);
    setFailedRows([]);
  }

  async function selectTarget(key: TargetKey) {
    setTarget(key);
    if (key !== "gradebook") {
      setStep("upload");
      return;
    }
    if (!institutionId || !role || !user) return;
    setBusy(true);
    try {
      const { classes, subjects, terms } = await fetchGradebookSetupOptions(institutionId, role, user.uid);
      setGbClasses(classes);
      setGbSubjects(subjects);
      setGbTerms(terms);
      setStep("gradebook-setup");
    } finally {
      setBusy(false);
    }
  }

  async function confirmGradebookSetup() {
    if (!institutionId || !user || !gbClassId || !gbSubjectId || !gbTermId) return;
    setGbSetupError(null);
    setBusy(true);
    try {
      const gradebookId = `${gbClassId}_${gbSubjectId}_${gbTermId}`;
      const setup = await fetchGradebookSetup(institutionId, gradebookId, {
        classId: gbClassId,
        className: gbClasses.find((c) => c.id === gbClassId)?.name ?? "",
        subjectId: gbSubjectId,
        subjectName: gbSubjects.find((s) => s.id === gbSubjectId)?.name ?? "",
        termId: gbTermId,
        termName: gbTerms.find((t) => t.id === gbTermId)?.name ?? "",
        teacherUid: user.uid,
      });
      if (!setup) {
        setGbSetupError(
          "This gradebook has no columns yet. Create columns on the Gradebook page first, then come back to import.",
        );
        return;
      }

      setGradebookColumnsById(setup.columnsById);
      setGradebookColumnCandidates(setup.columnCandidates);
      setGradebookContext(setup.context);
      setGradebookWriteContext(setup.writeContext);
      setStep("upload");
    } finally {
      setBusy(false);
    }
  }

  async function proceedToSummary(target_: TargetKey, resolved: Row[], resolvedRowNumbers: number[]) {
    if (target_ === "gradebook") {
      await proceedToGradebookSummary(resolved, resolvedRowNumbers);
      return;
    }
    if (target_ === "general_attendance") {
      await proceedToGeneralAttendanceSummary(resolved, resolvedRowNumbers);
      return;
    }
    if (target_ === "subject_attendance") {
      await proceedToSubjectAttendanceSummary(resolved, resolvedRowNumbers);
      return;
    }
    if (target_ === "students") {
      await proceedToStudentsSummary(resolved, resolvedRowNumbers);
      return;
    }
    const termIds = Array.from(new Set(resolved.map((r) => String(r.termId ?? "")).filter(Boolean)));
    const existingKeys = await fetchExistingKeysFor(target_, institutionId!, termIds);
    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setDuplicateCount(countAdvisoryDuplicates(resolved, existingKeys, (r) => duplicateKeyFor(target_, r)));
    setStep("summary");
  }

  /** No create-vs-update split (unlike Gradebook/Attendance) — every row creates a brand-new account, so there's nothing to merge into. The uniqueness pre-check (§Part C step 4) runs here, once for the whole file, before ever reaching the summary screen's Commit button. */
  async function proceedToStudentsSummary(resolved: Row[], resolvedRowNumbers: number[]) {
    if (!institutionId) return;
    const rows = resolved as unknown as ResolvedStudentImportRow[];
    const paired = rows.map((row, i) => ({ row, rowNumber: resolvedRowNumbers[i] }));

    const conflicts = await fetchStudentsUniquenessConflicts(institutionId, paired);
    if (conflicts.length > 0) {
      setRowErrors(conflicts);
      setStep("upload");
      return;
    }

    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setStep("summary");
  }

  async function proceedToGradebookSummary(resolved: Row[], resolvedRowNumbers: number[]) {
    if (!institutionId || !gradebookContext) return;
    const outcome = await summariseGradebookImport({
      institutionId,
      gradebookContext,
      gradebookColumnsById,
      resolved,
      resolvedRowNumbers,
    });
    if ("errors" in outcome) {
      setRowErrors(outcome.errors);
      setStep("upload");
      return;
    }
    setExistingResultIds(outcome.existingMap);
    setCreateCount(outcome.creates);
    setUpdateCount(outcome.updates);
    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setStep("summary");
  }

  async function proceedToGeneralAttendanceSummary(resolved: Row[], resolvedRowNumbers: number[]) {
    if (!institutionId) return;
    const outcome = await summariseGeneralAttendanceImport({ institutionId, resolved, resolvedRowNumbers });
    if ("errors" in outcome) {
      setRowErrors(outcome.errors);
      setStep("upload");
      return;
    }
    setGaGroups(outcome.groups);
    setGaExistingDocIds(outcome.existingMap);
    setCreateCount(outcome.creates);
    setUpdateCount(outcome.updates);
    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setStep("summary");
  }

  async function proceedToSubjectAttendanceSummary(resolved: Row[], resolvedRowNumbers: number[]) {
    if (!institutionId) return;
    const outcome = await summariseSubjectAttendanceImport({ institutionId, resolved, resolvedRowNumbers });
    if ("errors" in outcome) {
      setRowErrors(outcome.errors);
      setStep("upload");
      return;
    }
    setSaGroups(outcome.groups);
    setSaExistingDocIds(outcome.existingMap);
    setCreateCount(outcome.creates);
    setUpdateCount(outcome.updates);
    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setStep("summary");
  }

  async function resolveAndAdvance(target_: TargetKey, rows: Row[], rowNums: number[]) {
    if (!institutionId || !user || !role) return;

    const prepared = await prepareImportResolution({
      target: target_,
      institutionId,
      role,
      uid: user.uid,
      displayName,
      gradebookContext,
      gradebookColumnCandidates,
    });
    if (!prepared) return;
    setCandidates(prepared.candidates);
    if (prepared.writeContext) setWriteContext(prepared.writeContext);
    setResolvers(prepared.resolvers);

    const { resolved, needsResolution: pending } = await resolveIdentities(rows, prepared.resolvers);
    if (pending.length > 0) {
      setNeedsResolution(pending);
      setStep("resolve");
      return;
    }
    await proceedToSummary(target_, resolved, rowNums);
  }

  async function handleFile(file: File) {
    if (!target) return;
    setFileError(null);
    setStructuralMissing([]);
    setRowErrors([]);
    setBusy(true);
    try {
      const rawRows: RawRow[] = await parseSpreadsheetFile(file);
      if (rawRows.length === 0) {
        setFileError("The file has no data rows.");
        return;
      }
      const columns = columnsFor(target);
      const structural = validateStructure(rawRows, columns);
      if (!structural.ok) {
        setStructuralMissing(structural.missingHeaders);
        return;
      }
      const { rows, errors } = parseRows(rawRows, columns);
      if (errors.length > 0) {
        setRowErrors(errors);
        return;
      }
      // Business-rule validation run here (pre-resolution) rather than
      // after identity resolution as §5 lists it: for every rule below,
      // validity is resolution-independent, so validating before the
      // Firestore candidate fetch surfaces file-level mistakes sooner
      // without changing the outcome. Gradebook's score check and both
      // Attendance targets' date/duplicate checks are the exceptions —
      // they genuinely need resolved data, so they run later in
      // proceedToGradebookSummary/proceedTo{General,Subject}AttendanceSummary.
      const rules = validationRulesFor(target, gradebookContext);
      const { errors: businessErrors } = validateRows(rows, rules);
      if (businessErrors.length > 0) {
        setRowErrors(businessErrors);
        return;
      }
      const rowNums = rows.map((_, i) => i + 2);
      setParsedRows(rows);
      setRowNumbers(rowNums);
      await resolveAndAdvance(target, rows, rowNums);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to read file.");
    } finally {
      setBusy(false);
    }
  }

  async function applyResolutionsAndContinue() {
    if (!target) return;
    const missing = needsResolution.filter((e) => !decisions.has(decisionKey(e.column, e.value)));
    if (missing.length > 0) {
      setResolveError("Resolve every entry below before continuing.");
      return;
    }
    setResolveError(null);
    setBusy(true);
    try {
      const skipKeys = new Set(
        Array.from(decisions.entries())
          .filter(([, d]) => "skip" in d)
          .map(([k]) => k),
      );
      const keep = parsedRows.map(
        (row) => !resolvers.some((r) => skipKeys.has(decisionKey(r.label, String(row[r.column] ?? "").trim()))),
      );
      const afterSkip = parsedRows.filter((_, i) => keep[i]);
      const afterSkipRowNumbers = rowNumbers.filter((_, i) => keep[i]);
      const wrapped: IdentityResolver<Row>[] = resolvers.map((r) => ({
        ...r,
        lookup: async (raw: string) => {
          const d = decisions.get(decisionKey(r.label, raw.trim()));
          if (d && "selectedId" in d) return [{ id: d.selectedId, label: raw }];
          return r.lookup(raw);
        },
      }));
      const { resolved, needsResolution: stillNeeds } = await resolveIdentities(afterSkip, wrapped);
      if (stillNeeds.length > 0) {
        // Shouldn't happen given every original entry now has a decision —
        // defensive fallback in case a row's value changed shape somehow.
        setNeedsResolution(stillNeeds);
        return;
      }
      await proceedToSummary(target!, resolved, afterSkipRowNumbers);
    } finally {
      setBusy(false);
    }
  }

  /** §9's required follow-up, auto-triggered per this session's confirmed choice — see lib/importAttendanceRebuild.ts. */
  async function runGeneralAttendanceRebuild(institutionId_: string, groups: GeneralAttendanceGroup[]) {
    await runAttendanceRebuild(institutionId_, groups, {
      onProgress: setGaRebuildProgress,
      onDone: () => setGaRebuildDone(true),
    });
  }

  /** Students-only commit path — sequential, one account per row; see lib/importStudentsCommit.ts. */
  async function handleStudentsCommit(institutionId_: string) {
    if (!user) return;
    setStep("committing");
    setCommitProgress(null);

    // Same candidate list fetched in resolveAndAdvance's students branch,
    // still in state — used here only to resolve a house id to its display
    // name (StudentForm.tsx's own houseName denormalization), not re-fetched.
    const houseCandidates = (candidates as StudentsIdentityCandidates | null)?.houses ?? [];

    const { progress, failed } = await createImportedStudents({
      rows: resolvedRows as unknown as ResolvedStudentImportRow[],
      houseCandidates,
      institutionId_,
      creatorUid: user.uid,
      secondaryAuth,
      canonicalizePhone,
      onProgress: setCommitProgress,
    });

    setFailedRows(failed);
    setCommitResult(progress);
    invalidateUserCounts(); // imported students change the counts
    setStep("done");
  }

  async function handleCommit() {
    if (!target || !institutionId) return;
    if (target === "gradebook" && (!gradebookWriteContext || !gradebookContext)) return;
    if (target === "students") {
      await handleStudentsCommit(institutionId);
      return;
    }
    if (target !== "gradebook" && target !== "general_attendance" && target !== "subject_attendance" && !writeContext) return;

    setStep("committing");
    setCommitProgress(null);

    const writes = buildPendingWrites({
      target,
      institutionId,
      userUid: user?.uid,
      resolvedRows,
      gaGroups,
      gaExistingDocIds,
      saGroups,
      saExistingDocIds,
      gradebookColumnsById,
      existingResultIds,
      gradebookWriteContext,
      writeContext,
    });

    // Whatever this batch is built from (rows for Results/MDDS/Gradebook,
    // groups for both Attendance targets) — used to reconstruct which
    // original entries a failed chunk covered, for the downloadable error
    // report.
    const writeSourceRows = writeSourceRowsFor(target, gaGroups, saGroups, resolvedRows);

    const chunks = chunkWrites(writes);
    let chunkCursor = 0;
    let prevDone = 0;
    let prevErrorCount = 0;
    const failed: (Row & { __error: string })[] = [];

    const result = await chunkedBatchWrite(writes, db, (progress) => {
      setCommitProgress(progress);
      if (progress.errors.length > prevErrorCount) {
        const chunk = chunks[chunkCursor];
        const message = progress.errors[progress.errors.length - 1];
        const offset = chunks.slice(0, chunkCursor).reduce((sum, c) => sum + c.length, 0);
        for (let i = 0; i < chunk.length; i++) {
          failed.push({ ...writeSourceRows[offset + i], __error: message });
        }
        chunkCursor += 1;
        prevErrorCount = progress.errors.length;
      } else if (progress.done > prevDone) {
        chunkCursor += 1;
        prevDone = progress.done;
      }
    });

    setFailedRows(failed);
    setCommitResult(result);
    invalidateUserCounts(); // an import can add or move students
    setStep("done");

    if (target === "general_attendance") {
      // The rebuild is a follow-up to the import: if it fails, stop showing its progress and say
      // so (Admin > Rebuild attendance summaries can run it again).
      runGeneralAttendanceRebuild(institutionId, gaGroups).catch(
        onLoadError("the attendance summaries for this import", () => setGaRebuildProgress(null)),
      );
    }
  }

  function downloadErrorReport() {
    if (!target) return;
    const columns = errorReportColumnsFor(target);
    downloadCSV(`import-errors-${target}.csv`, failedRows, columns);
  }

  if (institutionId === SUPER_ADMIN_SENTINEL) {
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md flex-1 m-4">
        <h1 className="text-xl font-semibold mb-5">Import Data</h1>
        <p className="text-base text-gray-500 dark:text-gray-400">Select an institution to import data.</p>
      </div>
    );
  }

  const writeCount =
    target === "general_attendance" ? gaGroups.length
    : target === "subject_attendance" ? saGroups.length
    : resolvedRows.length;
  const importCap = target === "students" ? STUDENTS_IMPORT_CAP : IMPORT_WRITE_CAP;

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-md flex-1 m-4">
      {/* The card itself fills the page width (matching every other list/scene
          page's flex-1 card — see the width fix in the code review before
          this PR), but the actual step content — buttons, a dropzone, form
          fields — stays at a readable width instead of stretching edge to
          edge on a wide screen. */}
      <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-5">Import Data</h1>

      {step === "target" && <TargetStep role={role} busy={busy} selectTarget={selectTarget} />}
      {step === "gradebook-setup" && (
        <GradebookSetupStep
          resetAll={resetAll}
          gbClassId={gbClassId}
          setGbClassId={setGbClassId}
          gbClasses={gbClasses}
          gbSubjectId={gbSubjectId}
          setGbSubjectId={setGbSubjectId}
          gbSubjects={gbSubjects}
          gbTermId={gbTermId}
          setGbTermId={setGbTermId}
          gbTerms={gbTerms}
          gbSetupError={gbSetupError}
          busy={busy}
          confirmGradebookSetup={confirmGradebookSetup}
        />
      )}
      {step === "upload" && target && (
        <UploadStep
          target={target}
          resetAll={resetAll}
          gradebookContext={gradebookContext}
          busy={busy}
          fileError={fileError}
          structuralMissing={structuralMissing}
          rowErrors={rowErrors}
          handleFile={handleFile}
        />
      )}
      {step === "resolve" && target && (
        <ResolveStep
          resetAll={resetAll}
          needsResolution={needsResolution}
          decisions={decisions}
          setDecisions={setDecisions}
          candidatesByColumn={candidatesByColumn}
          resolveError={resolveError}
          busy={busy}
          applyResolutionsAndContinue={applyResolutionsAndContinue}
        />
      )}
      {step === "summary" && (
        <SummaryStep
          resetAll={resetAll}
          target={target}
          createCount={createCount}
          updateCount={updateCount}
          resolvedRows={resolvedRows}
          gaGroups={gaGroups}
          saGroups={saGroups}
          duplicateCount={duplicateCount}
          writeCount={writeCount}
          importCap={importCap}
          handleCommit={handleCommit}
        />
      )}
      {step === "committing" && (
        <p className="text-base">
          Committing… {commitProgress ? `${commitProgress.done} / ${commitProgress.total}` : "starting…"}
        </p>
      )}

      {step === "done" && commitResult && (
        <DoneStep
          commitResult={commitResult}
          target={target}
          failedRows={failedRows}
          downloadErrorReport={downloadErrorReport}
          gaRebuildProgress={gaRebuildProgress}
          gaRebuildDone={gaRebuildDone}
          resetAll={resetAll}
        />
      )}
      </div>
    </div>
  );
};

export default ImportPage;
