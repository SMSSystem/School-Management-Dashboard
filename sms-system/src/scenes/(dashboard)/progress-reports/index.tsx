import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { collection, getDocs, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection } from "@/lib/paths";
import { useCurrentTerm } from "@/lib/CurrentTermContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import FormModal from "@/components/FormModal";
import { PAGE_SIZE } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { generateProgressReport } from "@/lib/generateProgressReport";
import { letterGrade } from "@/lib/reportCardUtils";
import type { ProgressReportDocument } from "@/lib/firebase";
import { USE_MOCK } from "@/lib/data";
import {
  progressReportClassesMock,
  progressReportMockDefaults,
  progressReportStudentsMock,
  progressReportSubjectsMock,
  progressReportTermsMock,
  progressReportsMock,
} from "@/lib/mockData/progressReports";

const ProgressReportPDFModal = lazy(
  () => import("@/components/progressReport/ProgressReportPDFModal"),
);

type ReportRow = ProgressReportDocument & { id: string };
type GenMode = "single" | "batch";
type BatchProgress = { done: number; total: number; errors: string[] };

const columns = [
  { header: "Student", accessor: "studentName" },
  { header: "Term", accessor: "termName" },
  { header: "Class", accessor: "className", className: "hidden md:table-cell" },
  { header: "Average", accessor: "overallAverage", className: "hidden md:table-cell" },
  { header: "Generated", accessor: "generatedAt", className: "hidden md:table-cell" },
  { header: "Actions", accessor: "action" },
];

const SELECT_CLS =
  "border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 flex-1";

const BTN_CANCEL =
  "px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm rounded-md transition-colors";

const genAtMillis = (r: ReportRow): number =>
  r.generatedAt?.toDate?.()?.getTime() ?? 0;

// Fabricates a plausible snapshot locally — mirrors generateProgressReport()'s
// shape, but never touches Firestore. Mock mode must not fire real writes
// against the signed-in dev's actual institution using fabricated mock IDs
// (see the mock/live data-mode write-safety precedent used elsewhere in this
// app, e.g. Gradebook's performSave()).
function buildMockRow(studentId: string, termId: string): ReportRow {
  const student = progressReportStudentsMock.find((s) => s.id === studentId);
  const term = progressReportTermsMock.find((t) => t.id === termId);
  const subjects = progressReportSubjectsMock.map((s) => {
    const average = Math.round((60 + Math.random() * 35) * 10) / 10;
    return { ...s, average, letterGrade: letterGrade(average) };
  });
  const overallAverage =
    Math.round((subjects.reduce((sum, s) => sum + s.average, 0) / subjects.length) * 10) / 10;
  return {
    id: `mock-pr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...progressReportMockDefaults,
    studentId,
    studentName: student?.name ?? "Unknown Student",
    classId: student?.classId ?? "",
    className: student?.className ?? "",
    termId,
    termName: term?.name ?? "",
    subjects,
    overallAverage,
    generatedAt: Timestamp.now(),
  };
}

const ProgressReportsPage = () => {
  const { user, role, institutionId, displayName } = useAuth();
  const [page, setPage] = useState(1);

  const [liveReports, setLiveReports] = useState<ReportRow[]>([]);
  const [mockReports, setMockReports] = useState<ReportRow[]>(() => [...progressReportsMock]);
  const reports = USE_MOCK ? mockReports : liveReports;
  const [loading, setLoading] = useState(!USE_MOCK);

  const [students, setStudents] = useState<{ id: string; name: string }[]>(
    USE_MOCK ? progressReportStudentsMock.map((s) => ({ id: s.id, name: s.name })) : [],
  );
  const [terms, setTerms] = useState<{ id: string; name: string }[]>(
    USE_MOCK ? [...progressReportTermsMock] : [],
  );
  const [classes, setClasses] = useState<{ id: string; name: string }[]>(
    USE_MOCK ? [...progressReportClassesMock] : [],
  );
  const [linkedStudentIds, setLinkedStudentIds] = useState<string[]>([]);

  // Seeded once from the app-wide "current term" as a starting point for the
  // generate panel — same one-off, non-writeback pattern report-cards/index.tsx
  // uses (see its own comment for why).
  const { currentTermId } = useCurrentTerm();

  const [showPanel, setShowPanel] = useState(false);
  const [genMode, setGenMode] = useState<GenMode>("single");
  const [genStudentId, setGenStudentId] = useState("");
  const [genTermId, setGenTermId] = useState("");
  const [batchClassId, setBatchClassId] = useState("");
  const [batchTermId, setBatchTermId] = useState("");
  useEffect(() => {
    if (!genTermId && currentTermId) setGenTermId(currentTermId);
  }, [genTermId, currentTermId]);
  useEffect(() => {
    if (!batchTermId && currentTermId) setBatchTermId(currentTermId);
  }, [batchTermId, currentTermId]);

  const [generating, setGenerating] = useState(false);
  const [rowGeneratingId, setRowGeneratingId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  const [pdfReport, setPdfReport] = useState<ReportRow | null>(null);

  const isAdmin = role === "institution_admin";

  // Load dropdown data for the admin generate panel
  useEffect(() => {
    if (USE_MOCK || !isAdmin || !institutionId || institutionId === "*") return;
    getDocs(
      query(
        collection(db, "users"),
        where("role", "==", "student"),
        where("institutionId", "==", institutionId),
      ),
    ).then((snap) =>
      setStudents(
        snap.docs
          .map((d) => ({ id: d.id, name: d.data().name as string }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
    getDocs(institutionCollection(institutionId, "terms")).then((snap) =>
      setTerms(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );
    getDocs(institutionCollection(institutionId, "classes")).then((snap) =>
      setClasses(
        snap.docs
          .map((d) => ({ id: d.id, name: d.data().name as string }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }, [isAdmin, institutionId]);

  // Resolve linked children for parent role
  useEffect(() => {
    if (USE_MOCK || role !== "parent" || !user) return;
    getDocs(
      query(collection(db, "student_parents"), where("parentId", "==", user.uid)),
    ).then((snap) =>
      setLinkedStudentIds(snap.docs.map((d) => d.id.replace(`${user.uid}_`, ""))),
    );
  }, [role, user]);

  // Subscribe to progressReports, role-scoped — same read-permission shape
  // as reportCards (staff, self, or linked parent; see firestore.rules).
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;

    let q;
    if (role === "student" && user?.uid) {
      q = query(
        institutionCollection(institutionId, "progressReports"),
        where("studentId", "==", user.uid),
      );
    } else if (role === "parent") {
      if (linkedStudentIds.length === 0) {
        setLiveReports([]);
        setLoading(false);
        return;
      }
      // Firestore 'in' queries are limited to 10 values — same known limit
      // report-cards/index.tsx documents for parents with >10 linked children.
      q = query(
        institutionCollection(institutionId, "progressReports"),
        where("studentId", "in", linkedStudentIds.slice(0, 10)),
      );
    } else {
      q = query(institutionCollection(institutionId, "progressReports"));
    }

    return onSnapshot(q, (snap) => {
      setLiveReports(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReportRow));
      setLoading(false);
    });
  }, [institutionId, role, user, linkedStudentIds]);

  // §13.6 — no browsable history in v1: collapse to the newest snapshot per
  // (studentId, termId) pair. Older snapshots still exist in Firestore
  // (capped at PROGRESS_REPORT_CAP_PER_STUDENT_TERM) but aren't listed here.
  const latestReports = useMemo(() => {
    const byKey = new Map<string, ReportRow>();
    for (const r of reports) {
      const key = `${r.studentId}_${r.termId}`;
      const existing = byKey.get(key);
      if (!existing || genAtMillis(r) > genAtMillis(existing)) byKey.set(key, r);
    }
    return Array.from(byKey.values()).sort((a, b) => genAtMillis(b) - genAtMillis(a));
  }, [reports]);

  const handleGenerate = async () => {
    if (!genStudentId || !genTermId || !institutionId) return;
    setGenerating(true);
    setPanelError(null);

    if (USE_MOCK) {
      setMockReports((prev) => [buildMockRow(genStudentId, genTermId), ...prev]);
      setGenerating(false);
      setShowPanel(false);
      setGenStudentId("");
      setGenTermId("");
      return;
    }

    if (!user) {
      setGenerating(false);
      return;
    }
    try {
      const result = await generateProgressReport({
        studentId: genStudentId,
        termId: genTermId,
        institutionId,
        generatedBy: user.uid,
        generatedByName: displayName ?? "",
      });
      setGenerating(false);
      if (result.ok) {
        setShowPanel(false);
        setGenStudentId("");
        setGenTermId("");
      } else {
        setPanelError(result.error);
      }
    } catch (err) {
      setGenerating(false);
      setPanelError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  };

  const handleBatchGenerate = async () => {
    if (!batchClassId || !batchTermId || !institutionId) return;
    setGenerating(true);
    setPanelError(null);
    setBatchProgress(null);

    if (USE_MOCK) {
      const studentIds = progressReportStudentsMock
        .filter((s) => s.classId === batchClassId)
        .map((s) => s.id);
      if (studentIds.length === 0) {
        setPanelError("No students found in the selected class.");
        setGenerating(false);
        return;
      }
      const progress: BatchProgress = { done: 0, total: studentIds.length, errors: [] };
      setBatchProgress({ ...progress });
      const newRows: ReportRow[] = [];
      for (const studentId of studentIds) {
        newRows.push(buildMockRow(studentId, batchTermId));
        progress.done += 1;
        setBatchProgress({ ...progress });
      }
      setMockReports((prev) => [...newRows, ...prev]);
      setGenerating(false);
      return;
    }

    if (!user) {
      setGenerating(false);
      return;
    }
    try {
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
          where("classId", "==", batchClassId),
          where("role", "==", "student"),
        ),
      );
      const studentIds = snap.docs.map((d) => d.id);

      if (studentIds.length === 0) {
        setPanelError("No students found in the selected class.");
        setGenerating(false);
        return;
      }

      // Sequential — no second aggregation pass unlike report-cards' batch
      // (§4: Progress Report has no rank/average to reconcile after the fact).
      const progress: BatchProgress = { done: 0, total: studentIds.length, errors: [] };
      setBatchProgress({ ...progress });

      for (const studentId of studentIds) {
        const result = await generateProgressReport({
          studentId,
          termId: batchTermId,
          institutionId,
          generatedBy: user.uid,
          generatedByName: displayName ?? "",
        });
        progress.done += 1;
        if (!result.ok) progress.errors = [...progress.errors, result.error];
        setBatchProgress({ ...progress });
      }

      setGenerating(false);
    } catch (err) {
      setGenerating(false);
      setPanelError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  };

  const handleRowGenerateNew = async (row: ReportRow) => {
    if (!institutionId) return;
    setRowGeneratingId(row.id);
    setRowError(null);

    if (USE_MOCK) {
      setMockReports((prev) => [buildMockRow(row.studentId, row.termId), ...prev]);
      setRowGeneratingId(null);
      return;
    }

    if (!user) {
      setRowGeneratingId(null);
      return;
    }
    try {
      const result = await generateProgressReport({
        studentId: row.studentId,
        termId: row.termId,
        institutionId,
        generatedBy: user.uid,
        generatedByName: displayName ?? "",
      });
      setRowGeneratingId(null);
      if (!result.ok) setRowError(result.error);
    } catch (err) {
      setRowGeneratingId(null);
      setRowError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  };

  const handleMockDelete = (id: string) => {
    if (!window.confirm("Delete this progress report snapshot?")) return;
    setMockReports((prev) => prev.filter((r) => r.id !== id));
  };

  const closePanel = () => {
    setShowPanel(false);
    setPanelError(null);
    setBatchProgress(null);
  };

  const paginatedReports = latestReports.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const renderRow = (item: ReportRow) => {
    const genDate =
      item.generatedAt?.toDate?.()?.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }) ?? "—";
    return (
      <tr
        key={item.id}
        className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
      >
        <td className="flex items-center gap-4 p-4">{item.studentName}</td>
        <td>{item.termName}</td>
        <td className="hidden md:table-cell">{item.className}</td>
        <td className="hidden md:table-cell">
          {item.overallAverage !== null ? `${item.overallAverage.toFixed(1)}%` : "—"}
        </td>
        <td className="hidden md:table-cell">{genDate}</td>
        <td>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => handleRowGenerateNew(item)}
                disabled={rowGeneratingId === item.id}
                className="text-xs bg-lamaYellow hover:bg-yellow-300 text-gray-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
                title="Creates a new, additional snapshot — this row's own snapshot is never overwritten (Progress Reports are immutable)."
              >
                {rowGeneratingId === item.id ? "Generating…" : "Generate New"}
              </button>
            )}
            <button
              onClick={() => setPdfReport(item)}
              className="text-xs bg-sky-100 hover:bg-sky-200 text-sky-700 px-2 py-1 rounded transition-colors"
            >
              PDF
            </button>
            {isAdmin && (
              USE_MOCK ? (
                <button
                  onClick={() => handleMockDelete(item.id)}
                  className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded transition-colors"
                >
                  Delete
                </button>
              ) : (
                <FormModal table="progress_report" type="delete" id={item.id} />
              )
            )}
          </div>
        </td>
      </tr>
    );
  };

  if (institutionId === "*") {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
        <h1 className="text-lg font-semibold mb-4">Progress Reports</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select an institution to view progress reports.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">Progress Reports</h1>
        {isAdmin && (
          <button
            onClick={() => {
              setShowPanel((p) => !p);
              setPanelError(null);
              setBatchProgress(null);
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
            title="Generate Progress Report"
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </button>
        )}
      </div>

      {/* Generate Panel */}
      {showPanel && isAdmin && (
        <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setGenMode("single")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                genMode === "single"
                  ? "bg-sky-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              Single Student
            </button>
            <button
              onClick={() => setGenMode("batch")}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                genMode === "batch"
                  ? "bg-sky-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              Batch (Class)
            </button>
          </div>

          {genMode === "single" ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={genStudentId}
                onChange={(e) => setGenStudentId(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">Select student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={genTermId}
                onChange={(e) => setGenTermId(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">Select term…</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleGenerate}
                disabled={!genStudentId || !genTermId || generating}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-md transition-colors disabled:opacity-50"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
              <button onClick={closePanel} className={BTN_CANCEL}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={batchClassId}
                  onChange={(e) => setBatchClassId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">Select class…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={batchTermId}
                  onChange={(e) => setBatchTermId(e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">Select term…</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleBatchGenerate}
                  disabled={!batchClassId || !batchTermId || generating}
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-md transition-colors disabled:opacity-50"
                >
                  {generating ? "Generating…" : "Batch Generate"}
                </button>
                <button onClick={closePanel} className={BTN_CANCEL}>
                  Cancel
                </button>
              </div>

              {batchProgress && (
                <div className="text-xs mt-1">
                  <p className="text-gray-600 dark:text-gray-400">
                    Progress: {batchProgress.done} / {batchProgress.total}
                  </p>
                  {batchProgress.errors.length > 0 && (
                    <ul className="mt-1 text-red-500 list-disc list-inside">
                      {batchProgress.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  {batchProgress.done === batchProgress.total && (
                    <p className="text-green-600 dark:text-green-400 mt-1">
                      Done. {batchProgress.total - batchProgress.errors.length} succeeded,{" "}
                      {batchProgress.errors.length} failed.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {panelError && <p className="mt-2 text-xs text-red-500">{panelError}</p>}
        </div>
      )}

      {rowError && <p className="mt-2 text-xs text-red-500">{rowError}</p>}

      <Table columns={columns} renderRow={renderRow} data={paginatedReports} loading={loading} />
      <Pagination
        total={latestReports.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {pdfReport && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 text-white text-sm">
              Loading PDF renderer…
            </div>
          }
        >
          <ProgressReportPDFModal data={pdfReport} onClose={() => setPdfReport(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default ProgressReportsPage;
