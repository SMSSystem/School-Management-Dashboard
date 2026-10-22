import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { useAuth } from "@/lib/AuthContext";
import { useLinkedChildren } from "@/hooks/useLinkedChildren";
import { useStudentExamStatus } from "@/hooks/useStudentExamStatus";
import { listPairs, statusTargets, studentListRows, type ExamListDoc, type StudentListRow } from "@/lib/examStudentRows";
import { PAGE_SIZE } from "@/lib/utils";

const CHIP_CLS: Record<string, string> = {
  Scheduled: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "Open now": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  Open: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "In progress": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  Submitted: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "Result released": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  Missed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Closed: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
};

const ACTION_LABEL = { start: "Start", resume: "Resume", view: "View" } as const;

const dateText = (exam: ExamListDoc) =>
  (exam.date ? new Date(exam.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—") +
  (exam.startTime ? ` · ${exam.startTime}` : "");

// The Exams list for a student or a parent (EXAMS_FEATURE_SPEC.md §4.5 and §4.6): the exams of the student's classes and
// subjects, or of each linked child, with a status, a Start / Resume / View button for a student, and the released
// score. The attempts and scores are read only for recent exams (hooks/useStudentExamStatus.ts); the rest shows
// Closed. Cards on a phone, a table from the medium width up.
export default function StudentExamList({ exams, loading }: { exams: readonly ExamListDoc[]; loading: boolean }) {
  const { user, role, classId, classIds, classSubjects } = useAuth();
  const isParent = role === "parent";
  const { children, loading: childrenLoading } = useLinkedChildren();
  const [page, setPage] = useState(1);
  const nowMs = Date.now();

  const pairs = useMemo(
    () =>
      isParent
        ? listPairs(exams, { role: "parent", children })
        : listPairs(exams, { role: "student", uid: user?.uid ?? "", membership: { classId, classIds, classSubjects } }),
    [exams, isParent, children, user?.uid, classId, classIds, classSubjects],
  );
  const targets = statusTargets(pairs, isParent ? "parent" : "student", nowMs);
  const { maps, loading: statusLoading } = useStudentExamStatus(targets);
  const rows = studentListRows(pairs, isParent ? "parent" : "student", maps, nowMs);
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns = [
    { header: "Exam", accessor: "name" },
    ...(isParent ? [{ header: "Child", accessor: "child" }] : []),
    { header: "Date", accessor: "date", className: "hidden md:table-cell" },
    { header: "Duration", accessor: "duration", className: "hidden md:table-cell" },
    { header: "Status", accessor: "status" },
    { header: "Result", accessor: "result" },
    { header: "Actions", accessor: "action" },
  ];

  const chip = (row: StudentListRow<ExamListDoc>) =>
    row.status ? (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP_CLS[row.status] ?? ""}`}>{row.status}</span>
    ) : (
      "—"
    );
  const resultText = (row: StudentListRow<ExamListDoc>) =>
    row.result ? `${row.result.text}${row.result.percent !== null ? ` (${row.result.percent}%)` : ""}` : "—";
  const button = (row: StudentListRow<ExamListDoc>) =>
    row.action ? (
      <Link
        to={`/dashboard/list/exams/${row.exam.id}/take`}
        className="rounded-md px-3 py-1 text-xs font-medium text-white"
        style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        aria-label={`${ACTION_LABEL[row.action]} ${row.title}`}
      >
        {ACTION_LABEL[row.action]}
      </Link>
    ) : null;
  const titleCell = (row: StudentListRow<ExamListDoc>) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{row.title}</span>
        {row.online && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Online</span>
        )}
      </div>
      {row.exam.subjectName && row.exam.subjectName !== row.title && (
        <div className="text-xs text-gray-500 dark:text-gray-400">{row.exam.subjectName}</div>
      )}
    </>
  );

  const renderRow = (row: StudentListRow<ExamListDoc>) => (
    <tr
      key={row.key}
      className="border-b border-gray-200 text-sm even:bg-slate-50 hover:bg-lamaPurpleLight dark:border-gray-700 dark:even:bg-gray-800/60 dark:hover:bg-gray-800"
    >
      <td className="p-4">{titleCell(row)}</td>
      {isParent && <td>{row.child?.name}</td>}
      <td className="hidden md:table-cell">{dateText(row.exam)}</td>
      <td className="hidden md:table-cell">{row.exam.duration ? `${row.exam.duration} min` : "—"}</td>
      <td>{chip(row)}</td>
      <td>{resultText(row)}</td>
      <td>{button(row)}</td>
    </tr>
  );

  const renderCard = (row: StudentListRow<ExamListDoc>) => (
    <li key={row.key} className="flex flex-col gap-2 rounded-md p-3 ring-1 ring-gray-200 dark:ring-gray-700">
      <div>{titleCell(row)}</div>
      {isParent && row.child && <p className="text-xs text-gray-600 dark:text-gray-300">{row.child.name}</p>}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {dateText(row.exam)}
        {row.exam.duration ? ` · ${row.exam.duration} min` : ""}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          {chip(row)}
          <span>{resultText(row) !== "—" ? resultText(row) : ""}</span>
        </div>
        {button(row)}
      </div>
    </li>
  );

  return (
    <div className="m-4 flex-1 rounded-md bg-white p-4 dark:bg-gray-800">
      <h1 className="hidden text-lg font-semibold md:block">{isParent ? "Exams" : "My Exams"}</h1>
      <Table
        columns={columns}
        renderRow={renderRow}
        renderCard={renderCard}
        data={visible}
        loading={loading || childrenLoading || statusLoading}
      />
      <Pagination total={rows.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
}
