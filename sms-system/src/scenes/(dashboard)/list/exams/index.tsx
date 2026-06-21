import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { examsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";

type Exam = {
  id: string;
  examType: string;
  title: string;
  subjectName?: string | null;
  className: string;
  teacherName: string;
  occurrenceDate: string;
  institutionId?: string;
};

const columns = [
  { header: "Type",    accessor: "examType" },
  { header: "Title",   accessor: "title" },
  { header: "Subject", accessor: "subjectName",    className: "hidden md:table-cell" },
  { header: "Class",   accessor: "className" },
  { header: "Teacher", accessor: "teacherName",    className: "hidden md:table-cell" },
  { header: "Date",    accessor: "occurrenceDate", className: "hidden md:table-cell" },
  { header: "Actions", accessor: "action" },
];

const ExamListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveExams, setLiveExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "exams"), where("institutionId", "==", institutionId)),
      (snap) => {
        setLiveExams(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Exam)));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  const allExams: Exam[] = USE_MOCK ? (examsData as unknown as Exam[]) : liveExams;
  const filteredData = filterByInstitution(allExams, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: Exam) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.examType}</td>
      <td>{item.title}</td>
      <td className="hidden md:table-cell">{item.subjectName || "—"}</td>
      <td>{item.className}</td>
      <td className="hidden md:table-cell">{item.teacherName}</td>
      <td className="hidden md:table-cell">
        {item.occurrenceDate
          ? new Date(item.occurrenceDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : '—'}
      </td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && (
            <FormModal table="exam" type="update" data={item} />
          )}
          {(role === "institution_admin" || role === "super_admin") && (
            <FormModal table="exam" type="delete" id={item.id} />
          )}
        </div>
      </td>
    </tr>
  );

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
