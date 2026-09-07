import { useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, type Role } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, SUPER_ADMIN_SENTINEL } from "@/lib/paths";
import { downloadCSV, type ExportColumn } from "@/lib/spreadsheetExport";
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
  type ImportColumn,
  type ValidationRule,
  type IdentityResolver,
  type PendingWrite,
  type CommitProgress,
} from "@/lib/spreadsheetImport";
import {
  resultsImportColumns,
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
  mddsValidationRules,
  buildMddsIdentityResolvers,
  buildMddsData,
  mddsDuplicateKey,
  type MddsIdentityCandidates,
  type ResolvedMddsImportRow,
  type MddsWriteContext,
} from "@/lib/importMdds";

// The shared import UI (§5 of SPREADSHEET_IMPORT_SPEC.md) — §17 step 4,
// "built against Results/MDDS first, then parameterized for the remaining
// targets rather than built generically up front against unproven
// requirements." Per that explicit guidance, this file dispatches on a
// plain `target` string rather than a generic TargetConfig<Row> registry —
// real parameterization is deferred to step 5 (Gradebook), which will be
// the first target that actually forces it (create-vs-update dual write
// behavior §8, unlike Results/MDDS's uniform always-create).
//
// Template download (§5 step 2 / §13) is intentionally not built here —
// §17 lists it as its own step 8 ("can land any time after step 1"),
// separate from this one. The flow below goes straight from target
// selection to file upload.

type TargetKey = "results" | "mdds";
type Row = Record<string, unknown>;

const IMPLEMENTED_TARGETS: { key: TargetKey; label: string }[] = [
  { key: "results", label: "Results" },
  { key: "mdds", label: "MDDS (Disciplinary Actions)" },
];
// Land with steps 5-7; shown disabled so the target list already reflects
// all 5 domains §5 step 1 describes, per this app's existing "OUTCOMES"/
// "ATTENDANCE" nav grouping.
const PLANNED_TARGETS = ["Gradebook", "General Attendance", "Subject Attendance"];

// §11's table — identical allowed-role set for both targets today; kept
// per-target (not a single shared constant) because it stops being
// identical once Attendance targets land (regular_teacher can't write
// General Attendance; senior_teacher can't write Subject Attendance).
const TARGET_ALLOWED_ROLES: Record<TargetKey, Role[]> = {
  results: ["institution_admin", "super_admin", "senior_teacher", "regular_teacher"],
  mdds: ["institution_admin", "super_admin", "senior_teacher", "regular_teacher"],
};

const TARGET_COLLECTION: Record<TargetKey, string> = {
  results: "results",
  mdds: "disciplinaryActions",
};

// §2's hard cap — 10% of the 20,000-writes/day Spark quota (§12).
const IMPORT_WRITE_CAP = 2000;

const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const BTN_CLS = "bg-blue-400 text-white p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed";

function columnsFor(target: TargetKey): ImportColumn<Row>[] {
  return (target === "results" ? resultsImportColumns : mddsImportColumns) as unknown as ImportColumn<Row>[];
}

function rulesFor(target: TargetKey): ValidationRule<Row>[] {
  return (target === "results" ? resultsValidationRules : mddsValidationRules) as unknown as ValidationRule<Row>[];
}

function resolversFor(target: TargetKey, candidates: unknown): IdentityResolver<Row>[] {
  return (
    target === "results"
      ? buildResultsIdentityResolvers(candidates as ResultsIdentityCandidates)
      : buildMddsIdentityResolvers(candidates as MddsIdentityCandidates)
  ) as unknown as IdentityResolver<Row>[];
}

function duplicateKeyFor(target: TargetKey, row: Row): string {
  return target === "results"
    ? resultDuplicateKey(row as unknown as Parameters<typeof resultDuplicateKey>[0])
    : mddsDuplicateKey(row as unknown as Parameters<typeof mddsDuplicateKey>[0]);
}

function buildDataFor(target: TargetKey, row: Row, ctx: unknown): Record<string, unknown> {
  return target === "results"
    ? buildResultData(row as unknown as ResolvedResultImportRow, ctx as ResultWriteContext)
    : buildMddsData(row as unknown as ResolvedMddsImportRow, ctx as MddsWriteContext);
}

// ─── Firestore-touching fetches (kept out of importResults.ts/importMdds.ts
// on purpose — see those files' module comments) ──────────────────────────

async function fetchNameCandidates(refFn: () => ReturnType<typeof institutionCollection> | ReturnType<typeof query>) {
  const snap = await getDocs(refFn());
  return snap.docs.map((d) => ({ id: d.id, name: ((d.data() as Record<string, unknown>).name as string) ?? "" }));
}

async function fetchCandidatesFor(
  target: TargetKey,
  institutionId: string,
  role: Role,
  uid: string,
): Promise<ResultsIdentityCandidates | MddsIdentityCandidates> {
  const students = await fetchNameCandidates(() =>
    query(collection(db, "users"), where("role", "==", "student"), where("institutionId", "==", institutionId)),
  );
  const classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  const terms = await fetchNameCandidates(() => institutionCollection(institutionId, "terms"));

  if (target === "mdds") {
    return { students, classes, terms };
  }

  // Mirrors ResultForm.tsx: a regular_teacher only sees their own subjects.
  const subjects = await fetchNameCandidates(() =>
    role === "regular_teacher"
      ? query(institutionCollection(institutionId, "subjects"), where("teacherIds", "array-contains", uid))
      : institutionCollection(institutionId, "subjects"),
  );
  return { students, classes, subjects, terms };
}

async function fetchWriteContextFor(
  target: TargetKey,
  institutionId: string,
  uid: string,
  displayName: string | null,
  role: Role,
): Promise<ResultWriteContext | MddsWriteContext> {
  if (target === "mdds") {
    return { institutionId, issuedBy: uid, issuedByName: displayName ?? "", issuedByRole: role };
  }
  const snap = await getDoc(doc(db, "users", uid));
  const data = snap.exists() ? snap.data() : {};
  return {
    institutionId,
    teacherId: uid,
    teacherName: (data.name as string) ?? "",
    departmentId: (data.departmentId as string) ?? "",
  };
}

/** §19.3 — scoped to the terms actually referenced in this import, not the whole collection's history. */
async function fetchExistingKeysFor(target: TargetKey, institutionId: string, termIds: string[]): Promise<Set<string>> {
  if (termIds.length === 0) return new Set();
  const snap = await getDocs(
    query(institutionCollection(institutionId, TARGET_COLLECTION[target]), where("termId", "in", termIds.slice(0, 30))),
  );
  return new Set(snap.docs.map((d) => duplicateKeyFor(target, d.data() as Row)));
}

type Decision = { selectedId: string } | { skip: true };

function decisionKey(column: string, value: string): string {
  return `${column}::${value}`;
}

type Step = "target" | "upload" | "resolve" | "summary" | "committing" | "done";

const ImportPage = () => {
  const { user, role, institutionId, displayName } = useAuth();

  const [step, setStep] = useState<Step>("target");
  const [target, setTarget] = useState<TargetKey | null>(null);
  const [busy, setBusy] = useState(false);

  const [fileError, setFileError] = useState<string | null>(null);
  const [structuralMissing, setStructuralMissing] = useState<string[]>([]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);

  const [parsedRows, setParsedRows] = useState<Row[]>([]);
  const [candidates, setCandidates] = useState<ResultsIdentityCandidates | MddsIdentityCandidates | null>(null);
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

  const candidatesByColumn = useMemo(() => {
    if (!candidates || !target) return {} as Record<string, { id: string; name: string }[]>;
    if (target === "mdds") {
      const c = candidates as MddsIdentityCandidates;
      return { Student: c.students, Class: c.classes, Term: c.terms };
    }
    const c = candidates as ResultsIdentityCandidates;
    return { Student: c.students, Class: c.classes, Subject: c.subjects, Term: c.terms };
  }, [candidates, target]);

  function resetAll() {
    setStep("target");
    setTarget(null);
    setFileError(null);
    setStructuralMissing([]);
    setRowErrors([]);
    setParsedRows([]);
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

  async function proceedToSummary(target_: TargetKey, resolved: Row[]) {
    const termIds = Array.from(new Set(resolved.map((r) => String(r.termId ?? "")).filter(Boolean)));
    const existingKeys = await fetchExistingKeysFor(target_, institutionId!, termIds);
    setResolvedRows(resolved);
    setDuplicateCount(countAdvisoryDuplicates(resolved, existingKeys, (r) => duplicateKeyFor(target_, r)));
    setStep("summary");
  }

  async function resolveAndAdvance(target_: TargetKey, rows: Row[]) {
    if (!institutionId || !user || !role) return;
    const fetchedCandidates = await fetchCandidatesFor(target_, institutionId, role, user.uid);
    const fetchedCtx = await fetchWriteContextFor(target_, institutionId, user.uid, displayName, role);
    setCandidates(fetchedCandidates);
    setWriteContext(fetchedCtx);
    const builtResolvers = resolversFor(target_, fetchedCandidates);
    setResolvers(builtResolvers);

    const { resolved, needsResolution: pending } = await resolveIdentities(rows, builtResolvers);
    if (pending.length > 0) {
      setNeedsResolution(pending);
      setStep("resolve");
      return;
    }
    await proceedToSummary(target_, resolved);
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
      // after identity resolution as §5 lists it: for Results/MDDS every
      // rule is resolution-independent (score<=maxScore, enum/length
      // checks), so validating before the Firestore candidate fetch
      // surfaces file-level mistakes sooner without changing the outcome.
      // A future target whose rules depend on resolved fields should
      // validate post-resolution instead.
      const { errors: businessErrors } = validateRows(rows, rulesFor(target));
      if (businessErrors.length > 0) {
        setRowErrors(businessErrors);
        return;
      }
      setParsedRows(rows);
      await resolveAndAdvance(target, rows);
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
      const afterSkip = parsedRows.filter(
        (row) => !resolvers.some((r) => skipKeys.has(decisionKey(r.label, String(row[r.column] ?? "").trim()))),
      );
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
      await proceedToSummary(target, resolved);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!target || !institutionId || !writeContext) return;
    setStep("committing");
    setCommitProgress(null);
    const writes: PendingWrite[] = resolvedRows.map((row) => ({
      ref: doc(institutionCollection(institutionId, TARGET_COLLECTION[target])),
      data: buildDataFor(target, row, writeContext),
    }));
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
          failed.push({ ...resolvedRows[offset + i], __error: message });
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
    setStep("done");
  }

  function downloadErrorReport() {
    if (!target) return;
    const columns: ExportColumn<Row & { __error: string }>[] =
      target === "results"
        ? [
            { header: "Student", accessor: (r) => r.studentName as string },
            { header: "Class", accessor: (r) => r.className as string },
            { header: "Subject", accessor: (r) => r.subjectName as string },
            { header: "Term", accessor: (r) => r.termName as string },
            { header: "Assessment Name", accessor: (r) => r.assessmentName as string },
            { header: "Error", accessor: (r) => r.__error },
          ]
        : [
            { header: "Student", accessor: (r) => r.studentName as string },
            { header: "Class", accessor: (r) => r.className as string },
            { header: "Term", accessor: (r) => r.termName as string },
            { header: "Type", accessor: (r) => r.type as string },
            { header: "Date", accessor: (r) => r.date as string },
            { header: "Error", accessor: (r) => r.__error },
          ];
    downloadCSV(`import-errors-${target}.csv`, failedRows, columns);
  }

  if (institutionId === SUPER_ADMIN_SENTINEL) {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
        <h1 className="text-lg font-semibold mb-4">Import Data</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Select an institution to import data.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4 max-w-2xl">
      <h1 className="text-lg font-semibold mb-4">Import Data</h1>

      {step === "target" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Choose which kind of data you want to bulk-import from a spreadsheet.
          </p>
          {IMPLEMENTED_TARGETS.filter((t) => role && TARGET_ALLOWED_ROLES[t.key].includes(role)).map((t) => (
            <button
              key={t.key}
              type="button"
              className="text-left ring-[1.5px] ring-gray-300 dark:ring-gray-600 rounded-md p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              onClick={() => {
                setTarget(t.key);
                setStep("upload");
              }}
            >
              {t.label}
            </button>
          ))}
          {PLANNED_TARGETS.map((label) => (
            <div
              key={label}
              className="text-left ring-[1.5px] ring-gray-200 dark:ring-gray-700 rounded-md p-3 text-sm text-gray-400 dark:text-gray-600"
            >
              {label} <span className="text-xs">(coming soon)</span>
            </div>
          ))}
        </div>
      )}

      {step === "upload" && target && (
        <div>
          <button type="button" className="text-xs text-sky-600 dark:text-sky-400 underline mb-3" onClick={resetAll}>
            &larr; Change target
          </button>
          <p className="text-sm mb-2">
            Importing: <span className="font-medium">{IMPLEMENTED_TARGETS.find((t) => t.key === target)?.label}</span>
          </p>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void handleFile(f);
            }}
            className="ring-[1.5px] ring-dashed ring-gray-300 dark:ring-gray-600 rounded-md p-8 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            <p>Drag and drop a CSV or XLSX file here, or</p>
            <label className="inline-block mt-2 cursor-pointer text-sky-600 dark:text-sky-400 underline">
              browse files
              <input
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
          </div>
          {busy && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Reading file…</p>}
          {fileError && <p className="text-xs text-red-500 mt-2">{fileError}</p>}
          {structuralMissing.length > 0 && (
            <p className="text-xs text-red-500 mt-2">
              Missing required column(s): {structuralMissing.join(", ")}
            </p>
          )}
          {rowErrors.length > 0 && (
            <div className="mt-2 text-xs text-red-500">
              <p>{rowErrors.length} row(s) have errors — fix the file and re-upload:</p>
              <ul className="list-disc list-inside max-h-40 overflow-y-auto">
                {rowErrors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === "resolve" && target && (
        <div>
          <p className="text-sm mb-3">
            {needsResolution.length} value(s) in this file couldn't be matched to exactly one existing record.
            Resolve each one below, or choose to skip the affected row(s).
          </p>
          {needsResolution.map((entry) => {
            const key = decisionKey(entry.column, entry.value);
            const decision = decisions.get(key);
            const options =
              entry.matches.length > 0
                ? entry.matches
                : (candidatesByColumn[entry.column] ?? []).map((c) => ({ id: c.id, label: c.name }));
            return (
              <div key={key} className="border-b border-gray-100 dark:border-gray-700 py-3">
                <p className="text-sm">
                  <span className="font-medium">{entry.column}</span>: &quot;{entry.value}&quot; —{" "}
                  {entry.matches.length === 0 ? "no match found" : `${entry.matches.length} possible matches`}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <select
                    className={`${SELECT_CLS} max-w-xs`}
                    value={decision && "selectedId" in decision ? decision.selectedId : ""}
                    onChange={(e) => {
                      const next = new Map(decisions);
                      if (e.target.value) next.set(key, { selectedId: e.target.value });
                      else next.delete(key);
                      setDecisions(next);
                    }}
                  >
                    <option value="">Select the correct {entry.column.toLowerCase()}…</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={Boolean(decision && "skip" in decision)}
                      onChange={(e) => {
                        const next = new Map(decisions);
                        if (e.target.checked) next.set(key, { skip: true });
                        else next.delete(key);
                        setDecisions(next);
                      }}
                    />
                    Skip row(s) with this value
                  </label>
                </div>
              </div>
            );
          })}
          {resolveError && <p className="text-xs text-red-500 mt-2">{resolveError}</p>}
          <button type="button" className={`${BTN_CLS} mt-4`} disabled={busy} onClick={() => void applyResolutionsAndContinue()}>
            {busy ? "Checking…" : "Apply & Continue"}
          </button>
        </div>
      )}

      {step === "summary" && (
        <div>
          <p className="text-sm">{resolvedRows.length} document(s) will be created.</p>
          {duplicateCount > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
              {duplicateCount} of these rows match an already-existing record — this is informational only and
              won&apos;t block the import (§19.3).
            </p>
          )}
          {resolvedRows.length > IMPORT_WRITE_CAP ? (
            <p className="text-sm text-red-500 mt-2">
              This file would create {resolvedRows.length} documents, over the {IMPORT_WRITE_CAP}-write limit per
              import. Split the file and import in smaller batches.
            </p>
          ) : (
            <button
              type="button"
              className={`${BTN_CLS} mt-3`}
              disabled={resolvedRows.length === 0}
              onClick={() => void handleCommit()}
            >
              Commit import
            </button>
          )}
        </div>
      )}

      {step === "committing" && (
        <p className="text-sm">
          Committing… {commitProgress ? `${commitProgress.done} / ${commitProgress.total}` : "starting…"}
        </p>
      )}

      {step === "done" && commitResult && (
        <div>
          <p className="text-sm">
            {commitResult.done} of {commitResult.total} document(s) written successfully.
          </p>
          {failedRows.length > 0 && (
            <>
              <p className="text-sm text-red-500 mt-1">{failedRows.length} row(s) failed to commit.</p>
              <button
                type="button"
                className="mt-2 rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
                onClick={downloadErrorReport}
              >
                Download error report
              </button>
            </>
          )}
          <div>
            <button type="button" className={`${BTN_CLS} mt-4`} onClick={resetAll}>
              Start another import
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportPage;
