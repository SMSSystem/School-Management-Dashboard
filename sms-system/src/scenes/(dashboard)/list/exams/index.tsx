import { useState, useEffect } from "react";
import { subscribeSnapshot } from "@/lib/sharedSnapshot";
import FormModal from "@/components/FormModal";
import ExamCard from "@/components/exam/ExamCard";
import ExamRowActions from "@/components/exam/ExamRowActions";
import StudentExamList from "@/components/exam/StudentExamList";
import type { ExamListDoc } from "@/lib/examStudentRows";
import { useAuth } from "@/lib/AuthContext";
import { useStudentExams } from "@/hooks/useStudentExams";
import { onLoadError } from "@/lib/reportError";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { examsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { institutionCollection } from "@/lib/paths";
import { examRowInfo, type ExamAudience } from "@/lib/examListLogic";
import SubjectFilterBar from "@/components/SubjectFilterBar";
import { useSubjectFilter } from "@/hooks/useSubjectFilter";

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
  // Type, Teacher and Date wait for the lg width: between md and lg the table sits next to the sidebar and seven
  // columns plus the action buttons squeeze each other.
  {
    header: "Type",
    accessor: "type",
    className: "hidden lg:table-cell",
  },
  {
    header: "Teacher",
    accessor: "teacher",
    className: "hidden lg:table-cell",
  },
  {
    header: "Date",
    accessor: "date",
    className: "hidden lg:table-cell",
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
  Finalized:
    "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};

const ExamListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveExams, setLiveExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  const audience: ExamAudience =
    role === "student" || role === "parent" ? "student_parent" : "staff";
  // Staff listen to the whole collection; a student or a parent reads only the exams of their classes (hooks/useStudentExams.ts).
  const studentSide = useStudentExams();

  useEffect(() => {
    if (
      USE_MOCK ||
      !institutionId ||
      institutionId === "*" ||
      audience === "student_parent"
    )
      return;
    const unsubscribe = subscribeSnapshot(
      `exams:${institutionId}`,
      institutionCollection(institutionId, "exams"),
      (snap) => {
        setLiveExams(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Exam));
        setLoading(false);
      },
      onLoadError("exams", () => setLoading(false)),
    );
    return unsubscribe;
  }, [institutionId, audience]);

  const allExams: Exam[] = USE_MOCK
    ? (examsData as unknown as Exam[])
    : liveExams;
  const institutionExams = filterByInstitution(
    allExams,
    USE_MOCK ? null : institutionId,
  );
  // The Subject dropdown and chips (two or more subjects only), over the exams already loaded: no reads. Called
  // before the student/parent branch below, as every hook must be; that list has its own filter.
  const {
    subjects,
    hasSubjectFilter,
    activeSubject,
    setSubject: setSubjectFilter,
  } = useSubjectFilter(
    "exams",
    institutionExams.map((e) => e.subjectName),
  );
  const setSubject = (value: string) => {
    setSubjectFilter(value);
    setPage(1);
  };
  const filteredData = activeSubject
    ? institutionExams.filter((e) => e.subjectName === activeSubject)
    : institutionExams;
  const paginatedData = filteredData.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  const nowMs = Date.now();

  // A student and a parent have their own list: their classes' exams, a status, a Start button and the score.
  if (audience === "student_parent") {
    return USE_MOCK ? (
      <StudentExamList
        exams={filteredData as unknown as ExamListDoc[]}
        loading={false}
      />
    ) : (
      <StudentExamList
        exams={studentSide.exams}
        loading={studentSide.loading}
      />
    );
  }

  const canEdit =
    role === "institution_admin" ||
    role === "super_admin" ||
    role === "regular_teacher" ||
    role === "senior_teacher";
  const canDelete = role === "institution_admin" || role === "super_admin";

  // The buttons of an exam, for a row of the table and for a card; `touch` makes them 44 px, for a finger.
  const rowActions = (item: Exam, touch: boolean) => (
    <>
      <ExamRowActions exam={item} touch={touch} />
      {canEdit && (
        <FormModal
          table="exam"
          type="update"
          data={item as unknown as FormData}
          touch={touch}
        />
      )}
      {canDelete && (
        <FormModal
          table="exam"
          type="delete"
          id={item.id}
          data={item as unknown as FormData}
          touch={touch}
        />
      )}
    </>
  );

  const dateOf = (item: Exam) =>
    (item.date
      ? new Date(item.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "—") + (item.startTime ? ` · ${item.startTime}` : "");

  // A phone gets a card per exam (the table's columns, stacked) instead of the table.
  const renderCard = (item: Exam) => {
    const info = examRowInfo(item, nowMs, audience);
    return (
      <ExamCard
        key={item.id}
        title={info.title}
        online={info.online}
        subject={item.title && item.subjectName ? item.subjectName : undefined}
        className={item.className}
        typeLabel={info.typeLabel}
        teacher={item.teacherName}
        dateText={dateOf(item)}
        status={info.status}
        statusClass={info.status ? (STATUS_CLS[info.status] ?? "") : ""}
        actions={rowActions(item, true)}
      />
    );
  };

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
          {item.title && item.subjectName && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {item.subjectName}
            </div>
          )}
        </td>
        <td>{item.className}</td>
        <td className="hidden lg:table-cell">{info.typeLabel || "—"}</td>
        <td className="hidden lg:table-cell">{item.teacherName}</td>
        <td className="hidden lg:table-cell">
          {item.date
            ? new Date(item.date + "T00:00:00").toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
          {item.startTime ? ` · ${item.startTime}` : ""}
        </td>
        <td className="hidden md:table-cell">
          {info.status ? (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[info.status] ?? ""}`}
            >
              {info.status}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td>
          <div className="flex flex-wrap items-center gap-2 py-2">
            {rowActions(item, false)}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-md flex-1 m-2 sm:m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">All Exams</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" ||
            role === "super_admin" ||
            role === "regular_teacher" ||
            role === "senior_teacher") && (
            <FormModal table="exam" type="create" />
          )}
        </div>
      </div>
      {/* SUBJECT FILTER */}
      {hasSubjectFilter && (
        <SubjectFilterBar
          subjects={subjects}
          active={activeSubject}
          onChange={setSubject}
          matching={filteredData.length}
          total={institutionExams.length}
          page={page}
          singular="exam"
          plural="exams"
          loading={loading}
        />
      )}
      {/* LIST */}
      <Table
        columns={columns}
        renderRow={renderRow}
        renderCard={renderCard}
        data={paginatedData}
        loading={loading}
      />
      {/* PAGINATION */}
      <Pagination
        total={filteredData.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
};

export default ExamListPage;
