import { useState, useEffect, useMemo } from "react";
import { doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError, reportError } from "@/lib/reportError";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { resultsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { byName } from "@/lib/sortByName";
import { institutionCollection } from "@/lib/paths";
import { useLinkedStudentIds } from "@/lib/useLinkedStudentIds";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects, useAllInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import type { ResultDocument } from "@/lib/firebase";
import ExportMenu from "@/components/ExportMenu";
import { hasStaffView } from "@/lib/roleCapabilities";
import {
  downloadCSV,
  downloadXLSX,
  rowsToXLSXSheet,
  buildExportFilename,
  type ExportColumn,
} from "@/lib/spreadsheetExport";

type SubjectOption = {
  id: string;
  name: string;
  classScope?: string;
  classIds: string[];
  teacherIds: string[];
};

// Omits createdAt: this page passes rows to FormModal, whose `data` prop
// only accepts FormRecord-compatible values (string/number/string[]/
// undefined) — a Firestore Timestamp isn't one, and this page never
// displays or edits createdAt anyway.
type Result = Omit<ResultDocument, "createdAt"> & { id: string };

const columns = [
  {
    header: "Assessment",
    accessor: "assessmentName",
  },
  {
    header: "Student",
    accessor: "studentName",
  },
  {
    header: "Score",
    accessor: "score",
    className: "hidden md:table-cell",
  },
  {
    header: "Max Score",
    accessor: "maxScore",
    className: "hidden md:table-cell",
  },
  {
    header: "Teacher",
    accessor: "teacherName",
    className: "hidden md:table-cell",
  },
  {
    header: "Class",
    accessor: "className",
    className: "hidden md:table-cell",
  },
  {
    header: "Subject",
    accessor: "subjectId",
    className: "hidden md:table-cell",
  },
  {
    header: "Term",
    accessor: "termId",
    className: "hidden md:table-cell",
  },
  {
    header: "Date",
    accessor: "date",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

// Needs subjectNameById/termNameById in closure (no denormalized subjectName/
// termName on ResultDocument — see the comment on the subjectNameById state
// below), so this is a function called from inside the component rather than
// a top-level constant like `columns` above.
function buildResultExportColumns(
  subjectNameById: Record<string, string>,
  termNameById: Record<string, string>,
): ExportColumn<Result>[] {
  return [
    { header: "Student", accessor: (r) => r.studentName },
    { header: "Class", accessor: (r) => r.className },
    { header: "Subject", accessor: (r) => subjectNameById[r.subjectId] ?? "" },
    { header: "Assessment", accessor: (r) => r.assessmentName },
    { header: "Type", accessor: (r) => r.assessmentType },
    { header: "Score", accessor: (r) => r.score },
    { header: "Max Score", accessor: (r) => r.maxScore },
    { header: "Weight", accessor: (r) => r.weight ?? "" },
    { header: "Date", accessor: (r) => r.date ?? "" },
    { header: "Teacher", accessor: (r) => r.teacherName },
    { header: "Term", accessor: (r) => termNameById[r.termId] ?? "" },
    { header: "Source", accessor: (r) => (r.source === "gradebook" || r.gradebookColumnId ? "Gradebook" : "Manual entry") },
  ];
}

const ResultListPage = () => {
  const { user, role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveResults, setLiveResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  // Who sees the class filters and the results of a selected class: staff and a
  // spectator. Every write control below keys off the role itself (the create,
  // edit and delete checks), so a spectator never gets one.
  const isStaff = hasStaffView(role);

  // ---------------------------------------------------------------------------
  // Staff filter reference data (classes/subjects/terms) — only fetched for
  // staff roles, since student/parent don't see the filter row (§6 of
  // RESULTS_PAGE_IMPLEMENTATION_PLAN.md).
  // ---------------------------------------------------------------------------

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");
  const [includeGradebookResults, setIncludeGradebookResults] = useState(false);

  const { data: classes = [] } = useInstitutionClasses();
  // Server-filtered for regular_teacher (useInstitutionSubjects()); Results
  // additionally narrows for senior_teacher client-side, same as Gradebook —
  // a page-level UX choice, not a rule requirement (see the hook's comment).
  const { data: rawSubjects = [] } = useInstitutionSubjects();
  const subjects = useMemo<SubjectOption[]>(
    () =>
      role === "senior_teacher"
        ? rawSubjects.filter((s) => s.teacherIds?.includes(user?.uid ?? ""))
        : rawSubjects,
    [rawSubjects, role, user?.uid],
  );
  const { data: terms = [] } = useInstitutionTerms();
  const [assignedClassId, setAssignedClassId] = useState<string | null>(null);

  // All roles: the full, unfiltered subjects list (Subject column name
  // lookup for every role, including regular_teacher — a row in their own
  // results view can reference a subject someone else teaches, e.g. an
  // unfiltered class-wide view, which the role-scoped `subjects` above
  // wouldn't resolve). useAllInstitutionSubjects() ignores the viewer's own
  // role entirely, unlike useInstitutionSubjects() above — the security rule
  // permits this for every role (verified against firestore.rules; see the
  // hook's own comment), so this was never blocked by anything but this
  // page's own former per-file query shape. No result-doc stores a
  // denormalized subjectName/termName the way it does className, so this
  // lookup is the only way to show a name rather than a raw document ID.
  const { data: allSubjects = [] } = useAllInstitutionSubjects();
  const subjectNameById = useMemo(
    () => Object.fromEntries(allSubjects.map((s) => [s.id, s.name])),
    [allSubjects],
  );

  const termNameById = useMemo(
    () => Object.fromEntries(terms.map((t) => [t.id, t.name])),
    [terms],
  );

  // Senior teacher's own homeroom class, used to scope visibleClasses below.
  useEffect(() => {
    if (role === "senior_teacher" && user?.uid) {
      getDoc(doc(db, "users", user.uid)).then(
        (snap) => {
          if (snap.exists()) setAssignedClassId((snap.data().assignedClassId as string) ?? null);
        },
        onLoadError("your class"),
      );
    }
  }, [role, user?.uid]);

  // Auto-select the senior teacher's class — their Class select is disabled
  // (below), so without this they'd have no way to ever populate it.
  useEffect(() => {
    if (
      role === "senior_teacher" &&
      assignedClassId &&
      classes.some((c) => c.id === assignedClassId)
    ) {
      setSelectedClassId(assignedClassId);
    }
  }, [role, assignedClassId, classes]);

  const visibleClasses = useMemo(() => {
    if (role === "senior_teacher") {
      return assignedClassId ? classes.filter((c) => c.id === assignedClassId) : [];
    }
    if (role === "regular_teacher") {
      const teacherClassIds = new Set<string>();
      subjects.forEach((s) => {
        if (s.teacherIds?.includes(user?.uid ?? "")) {
          s.classIds?.forEach((cid) => teacherClassIds.add(cid));
        }
      });
      return classes.filter((c) => teacherClassIds.has(c.id));
    }
    return classes;
  }, [classes, subjects, role, user?.uid, assignedClassId]);

  const visibleSubjects = useMemo(() => {
    if (!selectedClassId) return [];
    const forClass = subjects.filter(
      (s) => s.classScope === "institution" || s.classIds?.includes(selectedClassId),
    );
    if (role === "regular_teacher" || role === "senior_teacher") {
      return forClass.filter((s) => s.teacherIds?.includes(user?.uid ?? ""));
    }
    return forClass;
  }, [subjects, selectedClassId, role, user?.uid]);

  // Drop a selected class/subject that's no longer in the visible list once
  // reference data has loaded (e.g. reassigned away from this teacher).
  useEffect(() => {
    if (selectedClassId && classes.length > 0 && !visibleClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId("");
    }
  }, [selectedClassId, classes, visibleClasses]);

  useEffect(() => {
    if (selectedSubjectId && !visibleSubjects.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId("");
    }
  }, [selectedSubjectId, visibleSubjects]);

  // ---------------------------------------------------------------------------
  // Results query — staff (filtered getDocs, §4) vs. student/parent
  // (identity-scoped onSnapshot, §5). Mutually exclusive by role, so only one
  // of these two effects is ever actually subscribed/fetching for a given
  // user — kept as two separate effects (rather than one branching effect)
  // so each one's own dependency array stays honest.
  // ---------------------------------------------------------------------------

  const { linkedStudentIds, loading: linkedLoading } = useLinkedStudentIds();

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;

    if (role === "student" && user) {
      setLoading(true);
      return onSnapshot(
        query(institutionCollection(institutionId, "results"), where("studentId", "==", user.uid)),
        (snap) => {
          setLiveResults(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Result)));
          setLoading(false);
        },
        onLoadError("your results", () => setLoading(false)),
      );
    }

    if (role === "parent") {
      if (linkedLoading) return;
      if (linkedStudentIds.length === 0) {
        setLiveResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      return onSnapshot(
        // Firestore 'in' queries are limited to 10 values. Parents with more
        // than 10 linked children will silently miss records beyond the
        // first 10. Chunked queries (batching in groups of 10) are a future
        // enhancement.
        query(institutionCollection(institutionId, "results"), where("studentId", "in", linkedStudentIds.slice(0, 10))),
        (snap) => {
          setLiveResults(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Result)));
          setLoading(false);
        },
        onLoadError("your children's results", () => setLoading(false)),
      );
    }
  }, [institutionId, role, user, linkedStudentIds, linkedLoading]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*" || !isStaff) return;
    if (!selectedClassId) {
      setLiveResults([]);
      return;
    }
    setLoading(true);
    const clauses = [where("classId", "==", selectedClassId)];
    if (selectedSubjectId) clauses.push(where("subjectId", "==", selectedSubjectId));
    if (selectedTermId) clauses.push(where("termId", "==", selectedTermId));

    getDocs(query(institutionCollection(institutionId, "results"), ...clauses))
      .then(
        (snap) => setLiveResults(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Result))),
        onLoadError("results"),
      )
      .finally(() => setLoading(false));
  }, [institutionId, isStaff, selectedClassId, selectedSubjectId, selectedTermId]);

  const allResults: Result[] = USE_MOCK ? (resultsData as unknown as Result[]) : liveResults;
  const byInstitution = filterByInstitution(allResults, USE_MOCK ? null : institutionId);
  const filteredData = byInstitution.filter((r) => !r.gradebookColumnId).sort(byName((r: Result) => r.studentName));
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Export runs its own fresh, filtered getDocs query rather than reusing
  // liveResults as-is — see SPREADSHEET_EXPORT_IMPLEMENTATION_PLAN.md §6.4.
  const handleExportResults = async (format: "csv" | "xlsx") => {
    if (!institutionId || institutionId === "*" || !selectedClassId) return;

    const clauses = [where("classId", "==", selectedClassId)];
    if (selectedSubjectId) clauses.push(where("subjectId", "==", selectedSubjectId));
    if (selectedTermId) clauses.push(where("termId", "==", selectedTermId));

    const snap = await getDocs(query(institutionCollection(institutionId, "results"), ...clauses)).catch((err) => {
      reportError(err, { what: "the results to export" });
      return null;
    });
    if (!snap) return;
    let exportRows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Result));
    if (!includeGradebookResults) {
      exportRows = exportRows.filter((r) => !r.gradebookColumnId);
    }

    const filenameParts = [
      "results",
      classes.find((c) => c.id === selectedClassId)?.name ?? "all-classes",
      selectedSubjectId ? (subjects.find((s) => s.id === selectedSubjectId)?.name ?? "all-subjects") : "all-subjects",
      selectedTermId ? (terms.find((t) => t.id === selectedTermId)?.name ?? "all-terms") : "all-terms",
      new Date().toISOString().slice(0, 10),
    ];

    const exportColumns = buildResultExportColumns(subjectNameById, termNameById);
    if (format === "csv") {
      downloadCSV(buildExportFilename(filenameParts, "csv"), exportRows, exportColumns);
    } else {
      downloadXLSX(buildExportFilename(filenameParts, "xlsx"), [
        { name: "Results", sheet: rowsToXLSXSheet(exportRows, exportColumns) },
      ]);
    }
  };

  const renderRow = (item: Result) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.assessmentName}</td>
      <td>{item.studentName}</td>
      <td className="hidden md:table-cell">{item.score}</td>
      <td className="hidden md:table-cell">{item.maxScore}</td>
      <td className="hidden md:table-cell">{item.teacherName}</td>
      <td className="hidden md:table-cell">{item.className}</td>
      <td className="hidden md:table-cell">{subjectNameById[item.subjectId] ?? '—'}</td>
      <td className="hidden md:table-cell">{termNameById[item.termId] ?? '—'}</td>
      <td className="hidden md:table-cell">{formatDate(item.date)}</td>
      <td>
        <div className="flex items-center gap-2">
          {(item.teacherId === user?.uid || role === "institution_admin" || role === "super_admin") && (
            <FormModal table="result" type="update" data={item} id={item.id} />
          )}
          {(role === "institution_admin" || role === "super_admin") && (
            <FormModal table="result" type="delete" id={item.id} />
          )}
        </div>
      </td>
    </tr>
  );

  // Phones: one card per result, with the score front and centre (the table
  // hides score, subject, term and date below md).
  const renderCard = (item: Result) => {
    const pct = item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 100) : null;
    const pctTone =
      pct === null
        ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
        : pct >= 70
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
          : pct >= 50
            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    const canEditRow = item.teacherId === user?.uid || role === "institution_admin" || role === "super_admin";
    const canDeleteRow = role === "institution_admin" || role === "super_admin";
    return (
      <li
        key={item.id}
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100 wrap-break-word">{item.assessmentName}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {[subjectNameById[item.subjectId], termNameById[item.termId]].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none">
              {item.score}
              <span className="text-sm font-medium text-gray-400"> / {item.maxScore}</span>
            </div>
            {pct !== null && (
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${pctTone}`}>{pct}%</span>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {[role !== "student" ? item.studentName : null, item.className, formatDate(item.date)].filter(Boolean).join(" · ")}
        </div>
        {(canEditRow || canDeleteRow) && (
          <div className="flex items-center gap-2">
            {canEditRow && <FormModal table="result" type="update" data={item} id={item.id} />}
            {canDeleteRow && <FormModal table="result" type="delete" id={item.id} />}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-md flex-1 m-2 sm:m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{role === "student" || role === "parent" ? "Results" : "All Results"}</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && (
            <FormModal table="result" type="create" />
          )}
        </div>
      </div>
      {/* FILTERS (staff only) */}
      {isStaff && (
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-3 sm:gap-4 mt-4">
          <select
            className="w-full sm:w-auto min-h-11 sm:min-h-0 ring-[1.5px] ring-gray-300 p-2 rounded-md text-base sm:text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedClassId}
            disabled={role === "senior_teacher"}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSelectedSubjectId("");
            }}
          >
            <option value="">Select Class</option>
            {visibleClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="w-full sm:w-auto min-h-11 sm:min-h-0 ring-[1.5px] ring-gray-300 p-2 rounded-md text-base sm:text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedSubjectId}
            disabled={!selectedClassId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
          >
            <option value="">All Subjects</option>
            {visibleSubjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            className="w-full sm:w-auto min-h-11 sm:min-h-0 ring-[1.5px] ring-gray-300 p-2 rounded-md text-base sm:text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedTermId}
            disabled={!selectedClassId}
            onChange={(e) => setSelectedTermId(e.target.value)}
          >
            <option value="">All Terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {selectedClassId && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={includeGradebookResults}
                  onChange={(e) => setIncludeGradebookResults(e.target.checked)}
                />
                Include gradebook-originated results
              </label>
              <ExportMenu formats={["csv", "xlsx"]} onExport={handleExportResults} />
            </>
          )}
        </div>
      )}
      {/* LIST */}
      {isStaff && !selectedClassId ? (
        <div className="flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 py-16">
          Select a class to view results.
        </div>
      ) : role === "parent" && !linkedLoading && linkedStudentIds.length === 0 ? (
        <div className="flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 py-16">
          No linked students found.
        </div>
      ) : (
        <>
          <Table columns={columns} renderRow={renderRow} renderCard={renderCard} data={paginatedData} loading={loading} />
          <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default ResultListPage;
