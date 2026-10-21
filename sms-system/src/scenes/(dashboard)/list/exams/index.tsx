import { useState, useEffect } from "react";
import { subscribeSnapshot } from "@/lib/sharedSnapshot";
import FormModal from "@/components/FormModal";
import ExamRowActions from "@/components/exam/ExamRowActions";
import StudentExamList from "@/components/exam/StudentExamList";
import type { ExamListDoc } from "@/lib/examStudentRows";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { examsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { institutionCollection } from "@/lib/paths";
import { examRowInfo, type ExamAudience } from "@/lib/examListLogic";

// What FormModal hands to the form: the exam document, whose Timestamps and flags the form reads itself.
type FormData = Record<string, string | number | readonly string[] | undefined>;

type Exam = {
  id: string;
  subjectName: string;
  className: string;
  teacherName: string;
  termName?: string;
  date: string;
  startTime?: string;
  room?: string;
  institutionId?: string;
  teacherId?: string;
  departmentId?: string;
  // Online exam fields (EXAMS_FEATURE_SPEC.md §5.1); absent on a schedule-only exam.
  title?: string;
  valueType?: string;
  valueTypeLabel?: string;
  online?: boolean;
  status?: string;
  opensAt?: unknown;
  closesAt?: unknown;
};

const columns = [
  {
    header: "Exam",
    accessor: "name",
  },
  {
    header: "Class",
    accessor: "class",
  },
  {
    header: "Type",
    accessor: "type",
    className: "hidden md:table-cell",
  },
  {
    header: "Teacher",
    accessor: "teacher",
    className: "hidden md:table-cell",
  },
  {
    header: "Date",
    accessor: "date",
    className: "hidden md:table-cell",
  },
  {
    header: "Status",
    accessor: "status",
    className: "hidden md:table-cell",
  },
  {
    header: "Actions",
    accessor: "action",
  },
];

// Staff see the exam's real status; students and parents see only Scheduled, Open or Closed.
const STATUS_CLS: Record<string, string> = {
  Draft: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Scheduled: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  Open: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  Closed: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  Finalized: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

const ExamListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveExams, setLiveExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = subscribeSnapshot(`exams:${institutionId}`,
      institutionCollection(institutionId, "exams"),
      (snap) => {
        setLiveExams(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Exam)));
        setLoading(false);
      },
      onLoadError("exams", () => setLoading(false)),
    );
    return unsubscribe;
  }, [institutionId]);

  const allExams: Exam[] = USE_MOCK ? (examsData as unknown as Exam[]) : liveExams;
  const filteredData = filterByInstitution(allExams, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const audience: ExamAudience = role === "student" || role === "parent" ? "student_parent" : "staff";
  const nowMs = Date.now();

  // A student and a parent have their own list: their classes' exams, a status, a Start button and the score.
  if (audience === "student_parent") return <StudentExamList exams={filteredData as unknown as ExamListDoc[]} loading={loading} />;

  const renderRow = (item: Exam) => {
    const info = examRowInfo(item, nowMs, audience);
    return (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{info.title}</span>
          {info.online && (
            <span className="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 px-2 py-0.5 text-xs font-semibold">
              Online
            </span>
          )}
        </div>
        {item.title && item.subjectName && <div className="text-xs text-gray-500 dark:text-gray-400">{item.subjectName}</div>}
      </td>
      <td>{item.className}</td>
      <td className="hidden md:table-cell">{info.typeLabel || "—"}</td>
      <td className="hidden md:table-cell">{item.teacherName}</td>
      <td className="hidden md:table-cell">
        {item.date
          ? new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : '—'}
        {item.startTime ? ` · ${item.startTime}` : ''}
      </td>
      <td className="hidden md:table-cell">
        {info.status ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[info.status] ?? ""}`}>{info.status}</span>
        ) : (
          "—"
        )}
      </td>
      <td>
        <div className="flex items-center gap-2">
          <ExamRowActions exam={item} />
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && (
            <FormModal table="exam" type="update" data={item as unknown as FormData} />
          )}
          {(role === "institution_admin" || role === "super_admin") && (
            <FormModal table="exam" type="delete" id={item.id} />
          )}
        </div>
      </td>
    </tr>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Exams</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && <FormModal table="exam" type="create" />}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default ExamListPage;
