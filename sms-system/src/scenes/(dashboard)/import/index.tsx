import { useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, type Role, type NonSchoolDayDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc, institutionSubcollection, SUPER_ADMIN_SENTINEL } from "@/lib/paths";
import { downloadCSV, type ExportColumn } from "@/lib/spreadsheetExport";
import { rebuildSummariesForClass } from "@/lib/attendanceSummaryUtils";
import ExportMenu from "@/components/ExportMenu";
import {
  parseSpreadsheetFile,
  validateStructure,
  parseRows,
  resolveIdentities,
  validateRows,
  chunkWrites,
  chunkedBatchWrite,
  countAdvisoryDuplicates,
  downloadImportTemplate,
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
  resultsImportExampleRow,
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
  mddsImportExampleRow,
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
  buildGradebookIdentityResolvers,
  validateGradebookScores,
  buildGradebookCreateData,
  buildGradebookUpdateData,
  type GradebookIdentityCandidates,
  type GradebookTargetContext,
  type GradebookColumnInfo,
  type ResolvedGradebookImportRow,
  type GradebookWriteContext,
} from "@/lib/importGradebook";
import {
  generalAttendanceImportColumns,
  generalAttendanceValidationRules,
  generalAttendanceImportExampleRow,
  buildGeneralAttendanceIdentityResolvers,
  validateGeneralAttendanceDates,
  groupGeneralAttendanceRows,
  buildGeneralAttendanceData,
  type GeneralAttendanceIdentityCandidates,
  type ResolvedGeneralAttendanceImportRow,
  type ClassTermInfo,
  type GeneralAttendanceGroup,
} from "@/lib/importGeneralAttendance";
import {
  subjectAttendanceImportColumns,
  subjectAttendanceValidationRules,
  subjectAttendanceImportExampleRow,
  buildSubjectAttendanceIdentityResolvers,
  validateSubjectAttendanceDates,
  groupSubjectAttendanceRows,
  buildSubjectAttendanceData,
  type SubjectAttendanceIdentityCandidates,
  type ResolvedSubjectAttendanceImportRow,
  type SubjectAttendanceGroup,
} from "@/lib/importSubjectAttendance";

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

type TargetKey = "results" | "mdds" | "gradebook" | "general_attendance" | "subject_attendance";
type Row = Record<string, unknown>;
type Candidates =
  | ResultsIdentityCandidates
  | MddsIdentityCandidates
  | GradebookIdentityCandidates
  | GeneralAttendanceIdentityCandidates
  | SubjectAttendanceIdentityCandidates;

const IMPLEMENTED_TARGETS: { key: TargetKey; label: string }[] = [
  { key: "results", label: "Results" },
  { key: "mdds", label: "MDDS (Disciplinary Actions)" },
  { key: "gradebook", label: "Gradebook" },
  { key: "general_attendance", label: "General Attendance" },
  { key: "subject_attendance", label: "Subject Attendance" },
];
// All 5 domains §5 step 1 describes are now implemented.
const PLANNED_TARGETS: string[] = [];

// §11's table — Results/MDDS/Gradebook share the same 4 roles; General
// Attendance excludes regular_teacher entirely; Subject Attendance is the
// inverse — it excludes senior_teacher entirely (per firestore.rules'
// subjectAttendance create/update check: isAdmin() or a subject-scoped
// regular_teacher, no senior_teacher branch at all).
const TARGET_ALLOWED_ROLES: Record<TargetKey, Role[]> = {
  results: ["institution_admin", "super_admin", "senior_teacher", "regular_teacher"],
  mdds: ["institution_admin", "super_admin", "senior_teacher", "regular_teacher"],
  gradebook: ["institution_admin", "super_admin", "senior_teacher", "regular_teacher"],
  general_attendance: ["institution_admin", "super_admin", "senior_teacher"],
  subject_attendance: ["institution_admin", "super_admin", "regular_teacher"],
};

const TARGET_COLLECTION: Record<"results" | "mdds", string> = {
  results: "results",
  mdds: "disciplinaryActions",
};

// §2's hard cap — 10% of the 20,000-writes/day Spark quota (§12). For
// General Attendance this is checked against the post-grouping document
// count, not the raw row count, per §12's own note.
const IMPORT_WRITE_CAP = 2000;

const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const BTN_CLS = "bg-blue-400 text-white p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed";

function columnsFor(target: TargetKey): ImportColumn<Row>[] {
  const cols =
    target === "results" ? resultsImportColumns
    : target === "mdds" ? mddsImportColumns
    : target === "gradebook" ? gradebookImportColumns
    : target === "general_attendance" ? generalAttendanceImportColumns
    : subjectAttendanceImportColumns;
  return cols as unknown as ImportColumn<Row>[];
}

function exampleRowFor(target: TargetKey): Record<string, string | number> {
  return target === "results" ? resultsImportExampleRow
    : target === "mdds" ? mddsImportExampleRow
    : target === "gradebook" ? gradebookImportExampleRow
    : target === "general_attendance" ? generalAttendanceImportExampleRow
    : subjectAttendanceImportExampleRow;
}

// §13's inline guidance — which columns are identity columns (§3), valid
// enum values, and (Attendance only) the merge-not-overwrite behavior
// (§9, §10), the one behavior most likely to surprise someone who doesn't
// read a manual first.
const TARGET_IDENTITY_COLUMNS: Record<TargetKey, string[]> = {
  results: ["Student", "Class", "Subject", "Term"],
  mdds: ["Student", "Class", "Term"],
  gradebook: ["Student", "Column"],
  general_attendance: ["Class", "Student"],
  subject_attendance: ["Subject", "Class", "Student"],
};

const TARGET_ENUM_HELP: Record<TargetKey, string | null> = {
  results: 'Assessment Type must be "coursework" or "exam".',
  mdds: 'Type must be "merit", "demerit", "detention", or "suspension".',
  gradebook: null,
  general_attendance: 'Session must be "AM" or "PM". State must be one of P/A/L/S/E/B (Present/Absent/Late/Sick/Excused/Blank).',
  subject_attendance: "State must be one of P/A/L/S/E/B (Present/Absent/Late/Sick/Excused/Blank).",
};

const ATTENDANCE_MERGE_NOTE =
  "If a document already exists for that class/date (and subject, for Subject Attendance), the import only fills in the students listed in your file — it never erases students already marked through the normal register.";

function resolversFor(target: "results" | "mdds", candidates: unknown): IdentityResolver<Row>[] {
  return (
    target === "results"
      ? buildResultsIdentityResolvers(candidates as ResultsIdentityCandidates)
      : buildMddsIdentityResolvers(candidates as MddsIdentityCandidates)
  ) as unknown as IdentityResolver<Row>[];
}

function duplicateKeyFor(target: "results" | "mdds", row: Row): string {
  return target === "results"
    ? resultDuplicateKey(row as unknown as Parameters<typeof resultDuplicateKey>[0])
    : mddsDuplicateKey(row as unknown as Parameters<typeof mddsDuplicateKey>[0]);
}

function buildDataFor(target: "results" | "mdds", row: Row, ctx: unknown): Record<string, unknown> {
  return target === "results"
    ? buildResultData(row as unknown as ResolvedResultImportRow, ctx as ResultWriteContext)
    : buildMddsData(row as unknown as ResolvedMddsImportRow, ctx as MddsWriteContext);
}

// ─── Firestore-touching fetches (kept out of the target modules on
// purpose — see those files' module comments) ─────────────────────────────

async function fetchNameCandidates(refFn: () => ReturnType<typeof institutionCollection> | ReturnType<typeof query>) {
  const snap = await getDocs(refFn());
  return snap.docs.map((d) => ({ id: d.id, name: ((d.data() as Record<string, unknown>).name as string) ?? "" }));
}

async function fetchAssignedClassId(uid: string): Promise<string | undefined> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data().assignedClassId as string | undefined) : undefined;
}

async function fetchCandidatesFor(
  target: "results" | "mdds",
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
  target: "results" | "mdds",
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

/** §19.3 — scoped to the terms actually referenced in this import, not the whole collection's history. Doesn't apply to Gradebook or General Attendance — §19.3 names Results/MDDS specifically, and both other targets' create-vs-update logic already handles what would otherwise be a "duplicate." */
async function fetchExistingKeysFor(target: "results" | "mdds", institutionId: string, termIds: string[]): Promise<Set<string>> {
  if (termIds.length === 0) return new Set();
  const snap = await getDocs(
    query(institutionCollection(institutionId, TARGET_COLLECTION[target]), where("termId", "in", termIds.slice(0, 30))),
  );
  return new Set(snap.docs.map((d) => duplicateKeyFor(target, d.data() as Row)));
}

/** Gradebook's setup-step candidate lists — see module comment. */
async function fetchGradebookSetupOptions(institutionId: string, role: Role, uid: string) {
  const classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  const terms = await fetchNameCandidates(() => institutionCollection(institutionId, "terms"));
  const subjects = await fetchNameCandidates(() =>
    role === "regular_teacher" || role === "senior_teacher"
      ? query(institutionCollection(institutionId, "subjects"), where("teacherIds", "array-contains", uid))
      : institutionCollection(institutionId, "subjects"),
  );
  return { classes, subjects, terms };
}

/** General Attendance candidates — a senior_teacher only sees their own assigned homeroom class (firestore.rules only lets them write that one); an admin sees every class. Students are unscoped, same as Results/MDDS. */
async function fetchGeneralAttendanceCandidates(
  institutionId: string,
  role: Role,
  uid: string,
): Promise<GeneralAttendanceIdentityCandidates> {
  const students = await fetchNameCandidates(() =>
    query(collection(db, "users"), where("role", "==", "student"), where("institutionId", "==", institutionId)),
  );
  let classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  if (role === "senior_teacher") {
    const assignedClassId = await fetchAssignedClassId(uid);
    classes = assignedClassId ? classes.filter((c) => c.id === assignedClassId) : [];
  }
  return { classes, students };
}

/** §9: a class's term is its own fixed ClassDocument.termId, not looked up per date — this just resolves that id to the term's actual date range/academicYearId so validateGeneralAttendanceDates can check consistency. */
async function fetchClassTermInfo(institutionId: string, classIds: string[]): Promise<Map<string, ClassTermInfo>> {
  const classDocs = await Promise.all(classIds.map((id) => getDoc(institutionDoc(institutionId, "classes", id))));
  const termIdByClass = new Map<string, string>();
  classDocs.forEach((snap) => {
    if (!snap.exists()) return;
    const termId = (snap.data() as Record<string, unknown>).termId as string | undefined;
    if (termId) termIdByClass.set(snap.id, termId);
  });

  const distinctTermIds = Array.from(new Set(termIdByClass.values()));
  const termDocs = await Promise.all(distinctTermIds.map((id) => getDoc(institutionDoc(institutionId, "terms", id))));
  const infoByTermId = new Map<string, ClassTermInfo>();
  termDocs.forEach((snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    infoByTermId.set(snap.id, {
      termId: snap.id,
      academicYearId: (data.academicYearId as string) ?? "",
      termStartDate: (data.startDate as string) ?? "",
      termEndDate: (data.endDate as string) ?? "",
    });
  });

  const result = new Map<string, ClassTermInfo>();
  termIdByClass.forEach((termId, classId) => {
    const info = infoByTermId.get(termId);
    if (info) result.set(classId, info);
  });
  return result;
}

/** Existing generalAttendance docs to merge into, one query per distinct class scoped to that class's date range in this import — matches the classId+date composite index already deployed. */
async function fetchExistingGeneralAttendanceDocs(
  institutionId: string,
  groups: GeneralAttendanceGroup[],
): Promise<Map<string, string>> {
  const rangeByClass = new Map<string, { minDate: string; maxDate: string }>();
  groups.forEach((g) => {
    const cur = rangeByClass.get(g.classId);
    if (!cur) rangeByClass.set(g.classId, { minDate: g.date, maxDate: g.date });
    else {
      if (g.date < cur.minDate) cur.minDate = g.date;
      if (g.date > cur.maxDate) cur.maxDate = g.date;
    }
  });

  const existingMap = new Map<string, string>();
  await Promise.all(
    Array.from(rangeByClass.entries()).map(async ([classId, { minDate, maxDate }]) => {
      const snap = await getDocs(
        query(
          institutionCollection(institutionId, "generalAttendance"),
          where("classId", "==", classId),
          where("date", ">=", minDate),
          where("date", "<=", maxDate),
        ),
      );
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        existingMap.set(`${classId}::${data.date as string}::${data.session as string}`, d.id);
      });
    }),
  );
  return existingMap;
}

/** Subject Attendance candidates — mirrors ResultForm.tsx's regular_teacher subject scoping; senior_teacher never reaches this target (excluded at TARGET_ALLOWED_ROLES). Classes/students are unscoped. */
async function fetchSubjectAttendanceCandidates(
  institutionId: string,
  role: Role,
  uid: string,
): Promise<SubjectAttendanceIdentityCandidates> {
  const students = await fetchNameCandidates(() =>
    query(collection(db, "users"), where("role", "==", "student"), where("institutionId", "==", institutionId)),
  );
  const classes = await fetchNameCandidates(() => institutionCollection(institutionId, "classes"));
  const subjects = await fetchNameCandidates(() =>
    role === "regular_teacher"
      ? query(institutionCollection(institutionId, "subjects"), where("teacherIds", "array-contains", uid))
      : institutionCollection(institutionId, "subjects"),
  );
  return { subjects, classes, students };
}

/** Existing subjectAttendance docs to merge into, one query per distinct (subjectId, classId) pair scoped to that pair's date range — matches the subjectId+classId+sessionDate composite index already deployed. */
async function fetchExistingSubjectAttendanceDocs(
  institutionId: string,
  groups: SubjectAttendanceGroup[],
): Promise<Map<string, string>> {
  const rangeByPair = new Map<string, { subjectId: string; classId: string; minDate: string; maxDate: string }>();
  groups.forEach((g) => {
    const key = `${g.subjectId}::${g.classId}`;
    const cur = rangeByPair.get(key);
    if (!cur) rangeByPair.set(key, { subjectId: g.subjectId, classId: g.classId, minDate: g.sessionDate, maxDate: g.sessionDate });
    else {
      if (g.sessionDate < cur.minDate) cur.minDate = g.sessionDate;
      if (g.sessionDate > cur.maxDate) cur.maxDate = g.sessionDate;
    }
  });

  const existingMap = new Map<string, string>();
  await Promise.all(
    Array.from(rangeByPair.values()).map(async ({ subjectId, classId, minDate, maxDate }) => {
      const snap = await getDocs(
        query(
          institutionCollection(institutionId, "subjectAttendance"),
          where("subjectId", "==", subjectId),
          where("classId", "==", classId),
          where("sessionDate", ">=", minDate),
          where("sessionDate", "<=", maxDate),
        ),
      );
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        existingMap.set(`${subjectId}::${classId}::${data.sessionDate as string}`, d.id);
      });
    }),
  );
  return existingMap;
}

interface GaRebuildProgress {
  done: number;
  total: number;
  students: number;
}

type Decision = { selectedId: string } | { skip: true };

function decisionKey(column: string, value: string): string {
  return `${column}::${value}`;
}

type Step = "target" | "gradebook-setup" | "upload" | "resolve" | "summary" | "committing" | "done";

const ImportPage = () => {
  const { user, role, institutionId, displayName } = useAuth();

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

  const candidatesByColumn = useMemo(() => {
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
    const c = candidates as ResultsIdentityCandidates;
    return { Student: c.students, Class: c.classes, Subject: c.subjects, Term: c.terms };
  }, [candidates, target]);

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
      const columnsSnap = await getDocs(institutionSubcollection(institutionId, "gradebooks", gradebookId, "columns"));
      if (columnsSnap.empty) {
        setGbSetupError(
          "This gradebook has no columns yet. Create columns on the Gradebook page first, then come back to import.",
        );
        return;
      }
      const columnsById = new Map<string, GradebookColumnInfo>();
      const columnCandidates: { id: string; name: string }[] = [];
      columnsSnap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const info: GradebookColumnInfo = {
          id: d.id,
          label: (data.label as string) ?? "",
          maxScore: (data.maxScore as number) ?? 0,
          columnWeight: (data.columnWeight as number) ?? 0,
          assessmentType: (data.assessmentType as "coursework" | "exam") ?? "coursework",
          date: data.date as string | undefined,
        };
        columnsById.set(d.id, info);
        columnCandidates.push({ id: d.id, name: info.label });
      });

      const subjectSnap = await getDoc(institutionDoc(institutionId, "subjects", gbSubjectId));
      const subjectData = subjectSnap.exists() ? (subjectSnap.data() as Record<string, unknown>) : {};
      const teacherNames = (subjectData.teacherNames as string[] | undefined) ?? [];

      const className = gbClasses.find((c) => c.id === gbClassId)?.name ?? "";
      const subjectName = gbSubjects.find((s) => s.id === gbSubjectId)?.name ?? "";
      const termName = gbTerms.find((t) => t.id === gbTermId)?.name ?? "";

      setGradebookColumnsById(columnsById);
      setGradebookColumnCandidates(columnCandidates);
      setGradebookContext({ classId: gbClassId, className, subjectId: gbSubjectId, subjectName, termId: gbTermId, termName });
      setGradebookWriteContext({
        institutionId,
        classId: gbClassId,
        className,
        subjectId: gbSubjectId,
        termId: gbTermId,
        teacherId: user.uid,
        teacherName: teacherNames[0] ?? "",
        departmentId: (subjectData.departmentId as string) ?? "",
      });
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
    const termIds = Array.from(new Set(resolved.map((r) => String(r.termId ?? "")).filter(Boolean)));
    const existingKeys = await fetchExistingKeysFor(target_, institutionId!, termIds);
    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setDuplicateCount(countAdvisoryDuplicates(resolved, existingKeys, (r) => duplicateKeyFor(target_, r)));
    setStep("summary");
  }

  async function proceedToGradebookSummary(resolved: Row[], resolvedRowNumbers: number[]) {
    if (!institutionId || !gradebookContext) return;
    const paired = resolved.map((row, i) => ({
      row: row as unknown as ResolvedGradebookImportRow,
      rowNumber: resolvedRowNumbers[i],
    }));
    const scoreErrors = validateGradebookScores(paired, gradebookColumnsById);
    if (scoreErrors.length > 0) {
      setRowErrors(scoreErrors);
      setStep("upload");
      return;
    }

    // Create-vs-update (§8): dedup key is (gradebookColumnId, studentId),
    // same as performSave — fetch this gradebook's existing results once
    // rather than querying per row.
    const existingSnap = await getDocs(
      query(
        institutionCollection(institutionId, "results"),
        where("classId", "==", gradebookContext.classId),
        where("subjectId", "==", gradebookContext.subjectId),
        where("termId", "==", gradebookContext.termId),
      ),
    );
    const existingMap = new Map<string, string>();
    existingSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (data.gradebookColumnId && data.studentId) {
        existingMap.set(`${data.studentId as string}::${data.gradebookColumnId as string}`, d.id);
      }
    });

    let creates = 0;
    let updates = 0;
    resolved.forEach((row) => {
      const key = `${row.studentId as string}::${row.columnId as string}`;
      if (existingMap.has(key)) updates += 1;
      else creates += 1;
    });

    setExistingResultIds(existingMap);
    setCreateCount(creates);
    setUpdateCount(updates);
    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setStep("summary");
  }

  async function proceedToGeneralAttendanceSummary(resolved: Row[], resolvedRowNumbers: number[]) {
    if (!institutionId) return;
    const gaRows = resolved as unknown as ResolvedGeneralAttendanceImportRow[];
    const distinctClassIds = Array.from(new Set(gaRows.map((r) => r.classId)));
    const classTermById = await fetchClassTermInfo(institutionId, distinctClassIds);

    const paired = gaRows.map((row, i) => ({ row, rowNumber: resolvedRowNumbers[i] }));
    const dateErrors = validateGeneralAttendanceDates(paired, classTermById);
    if (dateErrors.length > 0) {
      setRowErrors(dateErrors);
      setStep("upload");
      return;
    }

    const { groups, duplicateErrors } = groupGeneralAttendanceRows(paired, classTermById);
    if (duplicateErrors.length > 0) {
      setRowErrors(duplicateErrors);
      setStep("upload");
      return;
    }

    const existingMap = await fetchExistingGeneralAttendanceDocs(institutionId, groups);
    let creates = 0;
    let updates = 0;
    groups.forEach((g) => {
      if (existingMap.has(`${g.classId}::${g.date}::${g.session}`)) updates += 1;
      else creates += 1;
    });

    setGaGroups(groups);
    setGaExistingDocIds(existingMap);
    setCreateCount(creates);
    setUpdateCount(updates);
    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setStep("summary");
  }

  async function proceedToSubjectAttendanceSummary(resolved: Row[], resolvedRowNumbers: number[]) {
    if (!institutionId) return;
    const saRows = resolved as unknown as ResolvedSubjectAttendanceImportRow[];
    const distinctClassIds = Array.from(new Set(saRows.map((r) => r.classId)));
    // fetchClassTermInfo is target-agnostic — reused as-is from General Attendance's wiring (§10 derives term the same way §9 does).
    const classTermById = await fetchClassTermInfo(institutionId, distinctClassIds);

    const paired = saRows.map((row, i) => ({ row, rowNumber: resolvedRowNumbers[i] }));
    const dateErrors = validateSubjectAttendanceDates(paired, classTermById);
    if (dateErrors.length > 0) {
      setRowErrors(dateErrors);
      setStep("upload");
      return;
    }

    const { groups, duplicateErrors } = groupSubjectAttendanceRows(paired, classTermById);
    if (duplicateErrors.length > 0) {
      setRowErrors(duplicateErrors);
      setStep("upload");
      return;
    }

    const existingMap = await fetchExistingSubjectAttendanceDocs(institutionId, groups);
    let creates = 0;
    let updates = 0;
    groups.forEach((g) => {
      if (existingMap.has(`${g.subjectId}::${g.classId}::${g.sessionDate}`)) updates += 1;
      else creates += 1;
    });

    setSaGroups(groups);
    setSaExistingDocIds(existingMap);
    setCreateCount(creates);
    setUpdateCount(updates);
    setResolvedRows(resolved);
    setRowNumbers(resolvedRowNumbers);
    setStep("summary");
  }

  async function resolveAndAdvance(target_: TargetKey, rows: Row[], rowNums: number[]) {
    if (!institutionId || !user || !role) return;

    if (target_ === "gradebook") {
      if (!gradebookContext) return;
      const students = await fetchNameCandidates(() =>
        query(
          collection(db, "users"),
          where("role", "==", "student"),
          where("institutionId", "==", institutionId),
          where("classId", "==", gradebookContext.classId),
        ),
      );
      const gbCandidates: GradebookIdentityCandidates = { students, columns: gradebookColumnCandidates };
      setCandidates(gbCandidates);
      const builtResolvers = buildGradebookIdentityResolvers(gbCandidates) as unknown as IdentityResolver<Row>[];
      setResolvers(builtResolvers);
      const { resolved, needsResolution: pending } = await resolveIdentities(rows, builtResolvers);
      if (pending.length > 0) {
        setNeedsResolution(pending);
        setStep("resolve");
        return;
      }
      await proceedToSummary(target_, resolved, rowNums);
      return;
    }

    if (target_ === "general_attendance") {
      const gaCandidates = await fetchGeneralAttendanceCandidates(institutionId, role, user.uid);
      setCandidates(gaCandidates);
      const builtResolvers = buildGeneralAttendanceIdentityResolvers(gaCandidates) as unknown as IdentityResolver<Row>[];
      setResolvers(builtResolvers);
      const { resolved, needsResolution: pending } = await resolveIdentities(rows, builtResolvers);
      if (pending.length > 0) {
        setNeedsResolution(pending);
        setStep("resolve");
        return;
      }
      await proceedToSummary(target_, resolved, rowNums);
      return;
    }

    if (target_ === "subject_attendance") {
      const saCandidates = await fetchSubjectAttendanceCandidates(institutionId, role, user.uid);
      setCandidates(saCandidates);
      const builtResolvers = buildSubjectAttendanceIdentityResolvers(saCandidates) as unknown as IdentityResolver<Row>[];
      setResolvers(builtResolvers);
      const { resolved, needsResolution: pending } = await resolveIdentities(rows, builtResolvers);
      if (pending.length > 0) {
        setNeedsResolution(pending);
        setStep("resolve");
        return;
      }
      await proceedToSummary(target_, resolved, rowNums);
      return;
    }

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
      const rules: ValidationRule<Row>[] =
        target === "gradebook"
          ? (buildGradebookContextRules(gradebookContext!) as unknown as ValidationRule<Row>[])
          : target === "general_attendance"
            ? (generalAttendanceValidationRules as unknown as ValidationRule<Row>[])
            : target === "subject_attendance"
              ? (subjectAttendanceValidationRules as unknown as ValidationRule<Row>[])
              : ((target === "results" ? resultsValidationRules : mddsValidationRules) as unknown as ValidationRule<Row>[]);
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

  /** §9's required follow-up, auto-triggered per this session's confirmed choice — reuses RebuildAttendanceSummariesPage's own fetch pattern, scoped to just the (class, term) pairs this import actually touched. */
  async function runGeneralAttendanceRebuild(institutionId_: string, groups: GeneralAttendanceGroup[]) {
    const pairs = new Map<string, { classId: string; termId: string }>();
    groups.forEach((g) => pairs.set(`${g.classId}_${g.termId}`, { classId: g.classId, termId: g.termId }));
    if (pairs.size === 0) return;

    setGaRebuildProgress({ done: 0, total: pairs.size, students: 0 });

    const termIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.termId)));
    const termDocs = await Promise.all(termIds.map((id) => getDoc(institutionDoc(institutionId_, "terms", id))));
    const termMap = new Map<string, { startDate: string; endDate: string; academicYearId: string }>();
    termDocs.forEach((snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      termMap.set(snap.id, {
        startDate: data.startDate as string,
        endDate: data.endDate as string,
        academicYearId: data.academicYearId as string,
      });
    });

    const yearIds = Array.from(new Set(Array.from(termMap.values()).map((t) => t.academicYearId)));
    const yearDocs = await Promise.all(yearIds.map((id) => getDoc(institutionDoc(institutionId_, "academicYears", id))));
    const yearMap = new Map<string, { schoolWeekDays: number[] }>();
    yearDocs.forEach((snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Record<string, unknown>;
      yearMap.set(snap.id, { schoolWeekDays: (data.schoolWeekDays as number[] | undefined) ?? [1, 2, 3, 4, 5] });
    });

    const nsdByYear = new Map<string, NonSchoolDayDocument[]>();
    await Promise.all(
      yearIds.map(async (yearId) => {
        const snap = await getDocs(
          query(
            institutionCollection(institutionId_, "nonSchoolDays"),
            where("academicYearId", "==", yearId),
            where("isActive", "==", true),
          ),
        );
        nsdByYear.set(yearId, snap.docs.map((d) => d.data() as NonSchoolDayDocument));
      }),
    );

    let completed = 0;
    let totalStudents = 0;
    for (const { classId, termId } of pairs.values()) {
      const term = termMap.get(termId);
      const year = term ? yearMap.get(term.academicYearId) : undefined;
      if (term && year) {
        const count = await rebuildSummariesForClass({
          classId,
          termId,
          academicYearId: term.academicYearId,
          institutionId: institutionId_,
          termStartDate: term.startDate,
          termEndDate: term.endDate,
          schoolWeekDays: year.schoolWeekDays,
          nonSchoolDays: nsdByYear.get(term.academicYearId) ?? [],
        });
        totalStudents += count;
      }
      completed += 1;
      setGaRebuildProgress({ done: completed, total: pairs.size, students: totalStudents });
    }
    setGaRebuildDone(true);
  }

  async function handleCommit() {
    if (!target || !institutionId) return;
    if (target === "gradebook" && (!gradebookWriteContext || !gradebookContext)) return;
    if (target !== "gradebook" && target !== "general_attendance" && target !== "subject_attendance" && !writeContext) return;

    setStep("committing");
    setCommitProgress(null);

    const writes: PendingWrite[] =
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
              const ctx = { institutionId, submittedBy: user!.uid };
              if (existingId) {
                return {
                  ref: institutionDoc(institutionId, "generalAttendance", existingId),
                  data: buildGeneralAttendanceData(g, ctx, true),
                  merge: true,
                };
              }
              return {
                ref: doc(institutionCollection(institutionId, "generalAttendance")),
                data: buildGeneralAttendanceData(g, ctx, false),
              };
            })
          : target === "subject_attendance"
            ? saGroups.map((g) => {
                const existingId = saExistingDocIds.get(`${g.subjectId}::${g.classId}::${g.sessionDate}`);
                const ctx = { institutionId, teacherId: user!.uid };
                if (existingId) {
                  return {
                    ref: institutionDoc(institutionId, "subjectAttendance", existingId),
                    data: buildSubjectAttendanceData(g, ctx, true),
                    merge: true,
                  };
                }
                return {
                  ref: doc(institutionCollection(institutionId, "subjectAttendance")),
                  data: buildSubjectAttendanceData(g, ctx, false),
                };
              })
            : resolvedRows.map((row) => ({
                ref: doc(institutionCollection(institutionId, TARGET_COLLECTION[target])),
                data: buildDataFor(target, row, writeContext),
              }));

    // Whatever this batch is built from (rows for Results/MDDS/Gradebook,
    // groups for both Attendance targets) — used to reconstruct which
    // original entries a failed chunk covered, for the downloadable error
    // report.
    const writeSourceRows: Row[] =
      target === "general_attendance" ? (gaGroups as unknown as Row[])
      : target === "subject_attendance" ? (saGroups as unknown as Row[])
      : resolvedRows;

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
    setStep("done");

    if (target === "general_attendance") {
      void runGeneralAttendanceRebuild(institutionId, gaGroups);
    }
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
              : [
                  { header: "Subject", accessor: (r) => r.subjectName as string },
                  { header: "Class", accessor: (r) => r.className as string },
                  { header: "Date", accessor: (r) => r.sessionDate as string },
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

  const writeCount =
    target === "general_attendance" ? gaGroups.length
    : target === "subject_attendance" ? saGroups.length
    : resolvedRows.length;

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
              disabled={busy}
              className="text-left ring-[1.5px] ring-gray-300 dark:ring-gray-600 rounded-md p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              onClick={() => void selectTarget(t.key)}
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

      {step === "gradebook-setup" && (
        <div>
          <button type="button" className="text-xs text-sky-600 dark:text-sky-400 underline mb-3" onClick={resetAll}>
            &larr; Change target
          </button>
          <p className="text-sm mb-2">
            Pick the gradebook this import will fill in — the same Class, Subject, and Term you'd pick to open it on
            the Gradebook page. Every row in the file must belong to this one gradebook.
          </p>
          <div className="flex flex-col gap-2">
            <select className={SELECT_CLS} value={gbClassId} onChange={(e) => setGbClassId(e.target.value)}>
              <option value="">Select a class…</option>
              {gbClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select className={SELECT_CLS} value={gbSubjectId} onChange={(e) => setGbSubjectId(e.target.value)}>
              <option value="">Select a subject…</option>
              {gbSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className={SELECT_CLS} value={gbTermId} onChange={(e) => setGbTermId(e.target.value)}>
              <option value="">Select a term…</option>
              {gbTerms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {gbSetupError && <p className="text-xs text-red-500 mt-2">{gbSetupError}</p>}
          <button
            type="button"
            className={`${BTN_CLS} mt-3`}
            disabled={!gbClassId || !gbSubjectId || !gbTermId || busy}
            onClick={() => void confirmGradebookSetup()}
          >
            {busy ? "Checking…" : "Continue"}
          </button>
        </div>
      )}

      {step === "upload" && target && (
        <div>
          <button type="button" className="text-xs text-sky-600 dark:text-sky-400 underline mb-3" onClick={resetAll}>
            &larr; Change target
          </button>
          <p className="text-sm mb-2">
            Importing: <span className="font-medium">{IMPLEMENTED_TARGETS.find((t) => t.key === target)?.label}</span>
            {target === "gradebook" && gradebookContext && (
              <>
                {" "}
                — {gradebookContext.className} / {gradebookContext.subjectName} / {gradebookContext.termName}
              </>
            )}
          </p>

          <div className="ring-[1.5px] ring-gray-200 dark:ring-gray-700 rounded-md p-3 mb-3 text-xs text-gray-600 dark:text-gray-300 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <p>
                Identity columns ({TARGET_IDENTITY_COLUMNS[target].join(", ")}) are matched by name against your
                institution's existing records. A value that matches more than one record, or none, will need to be
                resolved by hand before anything is written.
              </p>
              <ExportMenu
                formats={["csv", "xlsx"]}
                label="Download Template"
                onExport={(format) =>
                  downloadImportTemplate(`import-template-${target}`, columnsFor(target), exampleRowFor(target), format)
                }
              />
            </div>
            {TARGET_ENUM_HELP[target] && <p>{TARGET_ENUM_HELP[target]}</p>}
            {(target === "general_attendance" || target === "subject_attendance") && <p>{ATTENDANCE_MERGE_NOTE}</p>}
          </div>

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
          {target === "gradebook" ? (
            <p className="text-sm">
              {createCount} result(s) will be created, {updateCount} will be updated.
            </p>
          ) : target === "general_attendance" ? (
            <p className="text-sm">
              {createCount} attendance document(s) will be created, {updateCount} will be updated — covering{" "}
              {resolvedRows.length} student-session entries across {gaGroups.length} class/date/session group(s).
            </p>
          ) : target === "subject_attendance" ? (
            <p className="text-sm">
              {createCount} attendance document(s) will be created, {updateCount} will be updated — covering{" "}
              {resolvedRows.length} student-session entries across {saGroups.length} subject/class/date group(s).
            </p>
          ) : (
            <>
              <p className="text-sm">{resolvedRows.length} document(s) will be created.</p>
              {duplicateCount > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                  {duplicateCount} of these rows match an already-existing record — this is informational only and
                  won&apos;t block the import (§19.3).
                </p>
              )}
            </>
          )}
          {writeCount > IMPORT_WRITE_CAP ? (
            <p className="text-sm text-red-500 mt-2">
              This file would write {writeCount} documents, over the {IMPORT_WRITE_CAP}-write limit per import. Split
              the file and import in smaller batches.
            </p>
          ) : (
            <button type="button" className={`${BTN_CLS} mt-3`} disabled={writeCount === 0} onClick={() => void handleCommit()}>
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
          {target === "general_attendance" && gaRebuildProgress && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              {gaRebuildDone
                ? `Rebuilt attendance summaries for ${gaRebuildProgress.total} affected class(es) (${gaRebuildProgress.students} summary document(s) updated).`
                : `Rebuilding attendance summaries for ${gaRebuildProgress.total} affected class(es)… ${gaRebuildProgress.done}/${gaRebuildProgress.total}`}
            </p>
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
