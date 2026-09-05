import { useState, useEffect, useMemo } from "react";
import { doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { resultsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { institutionCollection } from "@/lib/paths";
import { useLinkedStudentIds } from "@/lib/useLinkedStudentIds";
import { mapDocsById } from "@/lib/mapDocsById";

type ClassOption = { id: string; name: string };
type SubjectOption = {
  id: string;
  name: string;
  classScope?: string;
  classIds: string[];
  teacherIds: string[];
};
type TermOption = { id: string; name: string };

type Result = {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  termId: string;
  institutionId: string;
  departmentId: string;
  subjectId: string;
  assessmentName: string;
  score: number;
  maxScore: number;
  weight?: number;
  date?: string;
  gradebookColumnId?: string;
};

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

const ResultListPage = () => {
  const { user, role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveResults, setLiveResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  const isStaff = role === "institution_admin" || role === "super_admin"
    || role === "senior_teacher" || role === "regular_teacher";

  // ---------------------------------------------------------------------------
  // Staff filter reference data (classes/subjects/terms) — only fetched for
  // staff roles, since student/parent don't see the filter row (§6 of
  // RESULTS_PAGE_IMPLEMENTATION_PLAN.md).
  // ---------------------------------------------------------------------------

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedTermId, setSelectedTermId] = useState("");

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [assignedClassId, setAssignedClassId] = useState<string | null>(null);

  // Staff-only: classes + role-scoped subjects, feeding the filter dropdowns
  // (visibleClasses/visibleSubjects below). Deliberately not used for the
  // Subject/Term column name lookups — this `subjects` list is filtered to
  // the viewer's own teacherIds for regular_teacher/senior_teacher, but a
  // row in their own results view can reference a subject someone else
  // teaches (e.g. an unfiltered class-wide view), which this narrower list
  // wouldn't resolve.
  useEffect(() => {
    if (!isStaff || !institutionId || institutionId === "*") return;

    const unsubClasses = onSnapshot(
      institutionCollection(institutionId, "classes"),
      (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    const subjectQuery = role === "regular_teacher" || role === "senior_teacher"
      ? query(institutionCollection(institutionId, "subjects"), where("teacherIds", "array-contains", user!.uid))
      : institutionCollection(institutionId, "subjects");

    const unsubSubjects = onSnapshot(subjectQuery, (snap) =>
      setSubjects(snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        classScope: d.data().classScope as string | undefined,
        classIds: (d.data().classIds ?? []) as string[],
        teacherIds: (d.data().teacherIds ?? []) as string[],
      }))),
    );

    return () => {
      unsubClasses();
      unsubSubjects();
    };
  }, [isStaff, institutionId, role, user]);

  // All roles: terms (feeds the staff dropdown above and, via
  // termNameById, the Term column for every role) and the full, unfiltered
  // subjects list (Subject column name lookup for every role — see the
  // comment above on why the role-scoped `subjects` list above isn't reused
  // for this). No result-doc stores a denormalized subjectName/termName the
  // way it does className, so this lookup is the only way to show a name
  // rather than a raw document ID.
  const [subjectNameById, setSubjectNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;

    const unsubTerms = onSnapshot(
      institutionCollection(institutionId, "terms"),
      (snap) => setTerms(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    const unsubAllSubjects = onSnapshot(
      institutionCollection(institutionId, "subjects"),
      (snap) => setSubjectNameById(mapDocsById(snap.docs, (data, id) => (data.name as string) ?? id)),
    );

    return () => {
      unsubTerms();
      unsubAllSubjects();
    };
  }, [institutionId]);

  const termNameById = useMemo(
    () => Object.fromEntries(terms.map((t) => [t.id, t.name])),
    [terms],
  );

  // Senior teacher's own homeroom class, used to scope visibleClasses below.
  useEffect(() => {
    if (role === "senior_teacher" && user?.uid) {
      getDoc(doc(db, "users", user.uid)).then((snap) => {
        if (snap.exists()) setAssignedClassId((snap.data().assignedClassId as string) ?? null);
      });
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
      .then((snap) => setLiveResults(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Result))))
      .finally(() => setLoading(false));
  }, [institutionId, isStaff, selectedClassId, selectedSubjectId, selectedTermId]);

  const allResults: Result[] = USE_MOCK ? (resultsData as unknown as Result[]) : liveResults;
  const byInstitution = filterByInstitution(allResults, USE_MOCK ? null : institutionId);
  const filteredData = byInstitution.filter((r) => !r.gradebookColumnId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Results</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && (
            <FormModal table="result" type="create" />
          )}
        </div>
      </div>
      {/* FILTERS (staff only) */}
      {isStaff && (
        <div className="flex flex-wrap items-center gap-4 mt-4">
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
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
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
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
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 cursor-pointer disabled:opacity-60"
            value={selectedTermId}
            disabled={!selectedClassId}
            onChange={(e) => setSelectedTermId(e.target.value)}
          >
            <option value="">All Terms</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
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
          <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
          <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
};

export default ResultListPage;
