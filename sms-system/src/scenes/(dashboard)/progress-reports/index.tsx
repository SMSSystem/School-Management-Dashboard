import { lazy, Suspense, useMemo, useState } from "react";
import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useGeneratePanelState, type BatchProgress } from "@/hooks/useGeneratePanelState";
import { useLinkedStudentIds } from "@/hooks/useLinkedStudentIds";
import { useReportStudentOptions } from "@/hooks/useReportStudentOptions";
import { useRoleScopedReports } from "@/hooks/useRoleScopedReports";
import GenerateReportPanel from "@/components/reports/GenerateReportPanel";
import { PdfModalFallback, SelectInstitutionNotice } from "@/components/reports/reportPageParts";
import { formatGeneratedDate } from "@/lib/formatGeneratedDate";
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

const columns = [
  { header: "Student", accessor: "studentName" },
  { header: "Term", accessor: "termName" },
  { header: "Class", accessor: "className", className: "hidden md:table-cell" },
  { header: "Average", accessor: "overallAverage", className: "hidden md:table-cell" },
  { header: "Generated", accessor: "generatedAt", className: "hidden md:table-cell" },
  { header: "Actions", accessor: "action" },
];

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

  const [mockReports, setMockReports] = useState<ReportRow[]>(() => (USE_MOCK ? [...progressReportsMock] : []));

  const isAdmin = role === "institution_admin";
  const liveStudents = useReportStudentOptions(isAdmin && !USE_MOCK);
  const students = USE_MOCK
    ? progressReportStudentsMock.map((s) => ({ id: s.id, name: s.name }))
    : liveStudents;
  const { data: rawTerms } = useInstitutionTerms();
  const terms = USE_MOCK ? progressReportTermsMock : (rawTerms ?? []);
  const { data: rawClasses } = useInstitutionClasses();
  const classes = useMemo(
    () => (USE_MOCK ? progressReportClassesMock : [...(rawClasses ?? [])].sort((a, b) => a.name.localeCompare(b.name))),
    [rawClasses],
  );
  const linkedStudentIds = useLinkedStudentIds(!USE_MOCK);

  // Role-scoped, with the same read-permission shape as reportCards (staff, self, or linked
  // parent; see firestore.rules).
  const { rows: liveReports, loading } = useRoleScopedReports<ProgressReportDocument>(
    "progressReports",
    linkedStudentIds,
    "progress reports",
    !USE_MOCK,
  );
  const reports = USE_MOCK ? mockReports : liveReports;

  // The panel's state, seeded from the app-wide "current term" the same one-off, non-writeback
  // way report-cards/index.tsx does.
  const panel = useGeneratePanelState();
  const {
    showPanel,
    genStudentId,
    setGenStudentId,
    genTermId,
    setGenTermId,
    batchClassId,
    batchTermId,
    setGenerating,
    setPanelError,
    setShowPanel,
    setBatchProgress,
  } = panel;

  const [rowGeneratingId, setRowGeneratingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [pdfReport, setPdfReport] = useState<ReportRow | null>(null);

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

  const paginatedReports = latestReports.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const renderRow = (item: ReportRow) => {
    const genDate = formatGeneratedDate(item.generatedAt);
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
    return <SelectInstitutionNotice title="Progress Reports" noun="progress reports" />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">Progress Reports</h1>
        {isAdmin && (
          <button
            onClick={panel.togglePanel}
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
        <GenerateReportPanel
          panel={panel}
          students={students}
          terms={terms}
          classes={classes}
          onGenerate={handleGenerate}
          onBatchGenerate={handleBatchGenerate}
        />
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
        <Suspense fallback={<PdfModalFallback />}>
          <ProgressReportPDFModal data={pdfReport} onClose={() => setPdfReport(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default ProgressReportsPage;
