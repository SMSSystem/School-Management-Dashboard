import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, Timestamp } from "@/lib/firebase";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { feedbackCommentsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";

type FeedbackComment = {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  termId: string;
  termName: string;
  institutionId: string;
  departmentId: string;
  comment: string;
  createdAt: string;
};

const columns = [
  { header: "Student", accessor: "studentName" },
  { header: "Comment", accessor: "comment" },
  { header: "Class", accessor: "className", className: "hidden md:table-cell" },
  { header: "Term", accessor: "termName", className: "hidden md:table-cell" },
  { header: "Teacher", accessor: "teacherName", className: "hidden md:table-cell" },
  { header: "Date", accessor: "createdAt", className: "hidden md:table-cell" },
  { header: "Actions", accessor: "action" },
];

const FeedbackCommentListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveFeedback, setLiveFeedback] = useState<FeedbackComment[]>([]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      query(collection(db, "feedback_comments"), where("institutionId", "==", institutionId)),
      (snap) => setLiveFeedback(snap.docs.map((d) => {
        const raw = d.data();
        return {
          ...raw,
          id: d.id,
          createdAt: raw.createdAt instanceof Timestamp
            ? raw.createdAt.toDate().toISOString().slice(0, 10)
            : String(raw.createdAt ?? '').slice(0, 10),
        } as FeedbackComment;
      }))
    );
    return unsubscribe;
  }, [institutionId]);

  const allFeedback: FeedbackComment[] = USE_MOCK ? (feedbackCommentsData as unknown as FeedbackComment[]) : liveFeedback;
  const filteredData = filterByInstitution(allFeedback, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: FeedbackComment) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="flex items-center gap-4 p-4">{item.studentName}</td>
      <td className="max-w-xs">
        <span title={item.comment}>
          {item.comment.length > 80 ? item.comment.slice(0, 80) + "…" : item.comment}
        </span>
      </td>
      <td className="hidden md:table-cell">{item.className}</td>
      <td className="hidden md:table-cell">{item.termName}</td>
      <td className="hidden md:table-cell">{item.teacherName}</td>
      <td className="hidden md:table-cell">{item.createdAt}</td>
      <td>
        <div className="flex items-center gap-2">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && (
            <FormModal table="feedback_comment" type="update" data={item} />
          )}
          {(role === "institution_admin" || role === "super_admin") && (
            <FormModal table="feedback_comment" type="delete" id={item.id} />
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4 mt-0">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">Feedback Comments</h1>
        <div className="flex items-center gap-4">
          {(role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher") && (
            <FormModal table="feedback_comment" type="create" />
          )}
        </div>
      </div>
      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginatedData} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default FeedbackCommentListPage;
