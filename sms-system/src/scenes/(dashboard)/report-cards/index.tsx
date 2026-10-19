import { lazy, Suspense, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection } from "@/lib/paths";
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
import { PAGE_SIZE } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { generateReportCard } from "@/lib/generateReportCard";
import { computeRanks } from "@/lib/reportCardUtils";
import type { ReportCardDocument, ReportCardSubjectRow } from "@/lib/firebase";
import {
  buildExportFilename,
  downloadCSV,
  downloadXLSX,
  ExportColumn,
  rowsToXLSXSheet,
} from "@/lib/spreadsheetExport";
import ExportMenu from "@/components/ExportMenu";

const ReportCardPDFModal = lazy(
  () => import("@/components/reportCard/ReportCardPDFModal"),
);

type CardRow = ReportCardDocument & { id: string };

// Conduct tie-break: most frequent conductGrade across subjects[], ties broken
// by a fixed best-to-worst order rather than array order, so the result is
// deterministic regardless of how subjects[] happens to be sorted — see
// SPREADSHEET_EXPORT_IMPLEMENTATION_PLAN.md §7.2.
type ConductGrade = NonNullable<ReportCardSubjectRow["conductGrade"]>;

const CONDUCT_RANK: Record<ConductGrade, number> = {
  G: 0,
  S: 1,
  F: 2,
  P: 3,
  D: 4,
  U: 5, // best → worst
};

// subjects defaults to [] defensively — ReportCardDocument declares it
// required, but this codebase has precedent for legacy report cards not
// matching their current declared shape (see docs/bugs/KNOWN_ISSUES.md and
// the unrelated "stop MDDS rows from rendering 'undefined' for legacy report
// cards" fix elsewhere in this repo's history).
function summarizeConduct(
  subjects: ReportCardSubjectRow[] | null | undefined,
): string {
  const counts = new Map<ConductGrade, number>();
  for (const s of subjects ?? []) {
    if (s.conductGrade)
      counts.set(s.conductGrade, (counts.get(s.conductGrade) ?? 0) + 1);
  }
  if (counts.size === 0) return "";

  let best: ConductGrade | null = null;
  let bestCount = -1;
  for (const [grade, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount &&
        best !== null &&
        CONDUCT_RANK[grade] < CONDUCT_RANK[best])
    ) {
      best = grade;
      bestCount = count;
    }
  }
  return best ?? "";
}

const reportCardExportColumns: ExportColumn<CardRow>[] = [
  { header: "Student", accessor: (c) => c.studentName },
  { header: "Student ID", accessor: (c) => c.institutionStudentId ?? "" },
  { header: "Class", accessor: (c) => c.className },
  { header: "Term", accessor: (c) => c.termName },
  { header: "Class Average", accessor: (c) => c.classAverage ?? "" },
  { header: "Student Average", accessor: (c) => c.studentAverage ?? "" },
  { header: "Class Rank", accessor: (c) => c.classRank ?? "" },
  { header: "GPA", accessor: (c) => c.gpa ?? "" },
  { header: "Conduct", accessor: (c) => summarizeConduct(c.subjects) },
  { header: "Sessions Absent", accessor: (c) => c.sessionsAbsent },
  { header: "Days Late", accessor: (c) => c.daysLate },
  { header: "Merits", accessor: (c) => c.merits ?? "" },
  { header: "Demerits", accessor: (c) => c.demerits ?? "" },
  {
    header: "Generated",
    accessor: (c) =>
      c.generatedAt?.toDate?.()?.toISOString().slice(0, 10) ?? "",
  },
];

const columns = [
  { header: "Student", accessor: "studentName" },
  { header: "Term", accessor: "termName" },
  { header: "Class", accessor: "className", className: "hidden md:table-cell" },
  { header: "GPA", accessor: "gpa", className: "hidden md:table-cell" },
  {
    header: "Date Generated",
    accessor: "generatedAt",
    className: "hidden md:table-cell",
  },
  { header: "Actions", accessor: "action" },
];

const ReportCardsPage = () => {
  const { user, role, institutionId } = useAuth();
  const [page, setPage] = useState(1);

  const { data: terms = [] } = useInstitutionTerms();
  const { data: rawClasses = [] } = useInstitutionClasses();
  const classes = useMemo(
    () => [...rawClasses].sort((a, b) => a.name.localeCompare(b.name)),
    [rawClasses],
  );
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
    setPanelWarnings,
    setBatchProgress,
    setShowPanel,
  } = panel;

  const [regenId, setRegenId] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);

  const [pdfCard, setPdfCard] = useState<CardRow | null>(null);

  const isAdmin = role === "institution_admin";

  const students = useReportStudentOptions(isAdmin);
  const linkedStudentIds = useLinkedStudentIds(true);
  const { rows: cards } = useRoleScopedReports<ReportCardDocument>(
    "reportCards",
    linkedStudentIds,
    "report cards",
  );

  const handleGenerate = async () => {
    if (!genStudentId || !genTermId || !user || !institutionId) return;
    setGenerating(true);
    setPanelError(null);
    setPanelWarnings([]);
    try {
      const result = await generateReportCard({
        studentId: genStudentId,
        termId: genTermId,
        institutionId,
        generatedBy: user.uid,
        generatedByRole: role!,
      });
      setGenerating(false);
      if (result.ok) {
        setPanelWarnings(result.warnings);
        if (result.warnings.length === 0) {
          setShowPanel(false);
          setGenStudentId("");
          setGenTermId("");
        }
      } else {
        setPanelError(result.error);
      }
    } catch (err) {
      setGenerating(false);
      setPanelError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    }
  };

  const handleBatchGenerate = async () => {
    if (!batchClassId || !batchTermId || !user || !institutionId) return;
    setGenerating(true);
    setPanelError(null);
    setPanelWarnings([]);
    setBatchProgress(null);

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

      // Pass 1: generate all cards without rank/average to avoid order-dependent results.
      // Class rank depends on the full cohort; computing it per-student during sequential
      // writes means early students are ranked against an incomplete set.
      const progress: BatchProgress = {
        done: 0,
        total: studentIds.length,
        errors: [],
      };
      setBatchProgress({ ...progress });

      for (const studentId of studentIds) {
        const result = await generateReportCard({
          studentId,
          termId: batchTermId,
          institutionId,
          generatedBy: user.uid,
          generatedByRole: role!,
          generatedViaBatch: true,
          skipClassRankComputation: true,
        });
        progress.done += 1;
        if (!result.ok) progress.errors = [...progress.errors, result.error];
        setBatchProgress({ ...progress });
      }

      // Pass 2: read the full set of generated cards, compute class average and ranks
      // across all students in one pass, then write back via a single batch update.
      const allCardsSnap = await getDocs(
        query(
          institutionCollection(institutionId, "reportCards"),
          where("classId", "==", batchClassId),
          where("termId", "==", batchTermId),
        ),
      );
      const allCards = allCardsSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as ReportCardDocument),
      }));

      const validCards = allCards.filter((c) => c.studentAverage !== null);
      const classAverage =
        validCards.length > 0
          ? validCards.reduce((s, c) => s + (c.studentAverage as number), 0) /
            validCards.length
          : null;
      const ranks = computeRanks(
        validCards.map((c) => ({
          id: c.id,
          score: c.studentAverage as number,
        })),
      );

      const rankBatch = writeBatch(db);
      allCardsSnap.docs.forEach((d) => {
        rankBatch.update(d.ref, {
          classRank: ranks[d.id] ?? null,
          classAverage,
        });
      });
      await rankBatch.commit();

      setGenerating(false);
    } catch (err) {
      setGenerating(false);
      setPanelError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    }
  };

  const handleRegenerate = async (card: CardRow) => {
    if (!user || !institutionId) return;
    setRegenId(card.id);
    setRegenError(null);
    try {
      const result = await generateReportCard({
        studentId: card.studentId,
        termId: card.termId,
        institutionId,
        generatedBy: user.uid,
        generatedByRole: role!,
      });
      setRegenId(null);
      if (!result.ok) setRegenError(result.error);
    } catch (err) {
      setRegenId(null);
      setRegenError(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    }
  };

  // Reuses the already-loaded `cards` state — this page has no class/term
  // filter of its own, so "currently loaded" is simply the full role-scoped
  // list; zero additional Firestore reads. See
  // SPREADSHEET_EXPORT_IMPLEMENTATION_PLAN.md §7.4.
  const handleExportCards = (format: "csv" | "xlsx") => {
    const filenameParts = [
      "report-cards",
      "all-classes",
      "all-terms",
      new Date().toISOString().slice(0, 10),
    ];
    if (format === "csv") {
      downloadCSV(
        buildExportFilename(filenameParts, "csv"),
        cards,
        reportCardExportColumns,
      );
    } else {
      downloadXLSX(buildExportFilename(filenameParts, "xlsx"), [
        {
          name: "Report Cards",
          sheet: rowsToXLSXSheet(cards, reportCardExportColumns),
        },
      ]);
    }
  };

  const paginatedCards = cards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: CardRow) => {
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
          {item.gpa !== null ? item.gpa.toFixed(2) : "—"}
        </td>
        <td className="hidden md:table-cell">{genDate}</td>
        <td>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => handleRegenerate(item)}
                disabled={regenId === item.id}
                className="text-xs bg-lamaYellow hover:bg-yellow-300 text-gray-700 px-2 py-1 rounded transition-colors disabled:opacity-50"
              >
                {regenId === item.id ? "Generating…" : "Re-generate"}
              </button>
            )}
            <button
              onClick={() => setPdfCard(item)}
              className="text-xs bg-sky-100 hover:bg-sky-200 text-sky-700 px-2 py-1 rounded transition-colors"
            >
              PDF
            </button>
          </div>
        </td>
      </tr>
    );
  };

  if (institutionId === "*") {
    return <SelectInstitutionNotice title="Report Cards" noun="report cards" />;
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">Report Cards</h1>
        <div className="flex items-center gap-2">
          {/* Exporting only reads what is already on screen, so a spectator gets it
              too; generate and re-generate stay admin-only. */}
          {(isAdmin || role === "spectator") && (
            <ExportMenu
              formats={["csv", "xlsx"]}
              disabled={cards.length === 0}
              onExport={handleExportCards}
            />
          )}
          {isAdmin && (
            <button
              onClick={panel.togglePanel}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
              title="Generate Report Card"
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
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

      {regenError && <p className="mt-2 text-xs text-red-500">{regenError}</p>}

      <Table columns={columns} renderRow={renderRow} data={paginatedCards} />
      <Pagination
        total={cards.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {pdfCard && (
        <Suspense fallback={<PdfModalFallback />}>
          <ReportCardPDFModal data={pdfCard} onClose={() => setPdfCard(null)} />
        </Suspense>
      )}
    </div>
  );
};

export default ReportCardsPage;
