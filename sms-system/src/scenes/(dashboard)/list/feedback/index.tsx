import { useState, useEffect, useMemo } from "react";
import { onSnapshot } from "firebase/firestore";
import FormModal from "@/components/FormModal";
import { useAuth } from "@/lib/AuthContext";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { feedbackCommentsData, USE_MOCK } from "@/lib/data";
import { filterByInstitution, PAGE_SIZE } from "@/lib/utils";
import { institutionCollection } from "@/lib/paths";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useAllInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { conductLabel, feedbackCommentText } from "@/lib/feedbackComment";
import { toIsoDate } from "@/lib/dateValue";
import { formatDate } from "@/lib/formatDate";

// What the app's writers (Gradebook, Feedback form) actually store: comment numbers and a
// conduct code, never the comment sentence. termName and subjectName are not always stored
// (the Gradebook omits termName), so they are resolved from the cached terms and subjects.
// `comment` is kept only for older or mock documents. commentNumbers is read separately (below):
// FormModal's data type does not accept a number[], and the form reads it from the document itself.
type FeedbackComment = {
  id: string;
  studentId?: string;
  studentName?: string;
  teacherId?: string;
  teacherName?: string;
  classId?: string;
  className?: string;
  termId?: string;
  termName?: string;
  subjectId?: string;
  institutionId?: string;
  departmentId?: string;
  conductGrade?: string;
  comment?: string;
  createdAt?: string;
};

const columns = [
  { header: "Student", accessor: "studentName" },
  { header: "Class", accessor: "className", className: "hidden md:table-cell" },
  { header: "Subject", accessor: "subjectId", className: "hidden md:table-cell" },
  { header: "Term", accessor: "termName", className: "hidden md:table-cell" },
  { header: "Teacher", accessor: "teacherName", className: "hidden md:table-cell" },
  { header: "Conduct", accessor: "conductGrade", className: "hidden md:table-cell" },
  { header: "Comment", accessor: "comment" },
  { header: "Date", accessor: "createdAt", className: "hidden md:table-cell" },
  { header: "Actions", accessor: "action" },
];

const FeedbackCommentListPage = () => {
  const { role, institutionId } = useAuth();
  const [page, setPage] = useState(1);
  const [liveFeedback, setLiveFeedback] = useState<FeedbackComment[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  const { data: terms = [] } = useInstitutionTerms();
  const { data: subjects = [] } = useAllInstitutionSubjects();

  const termNameById = useMemo(() => Object.fromEntries(terms.map((t) => [t.id, t.name])), [terms]);
  const subjectNameById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s.name])), [subjects]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === "*") return;
    const unsubscribe = onSnapshot(
      institutionCollection(institutionId, "feedback_comments"),
      (snap) => {
        setLiveFeedback(snap.docs.map((d) => {
          const raw = d.data();
          return {
            ...raw,
            id: d.id,
            // toIsoDate reads a Firestore Timestamp by its toDate() method, not instanceof.
            createdAt: toIsoDate(raw.createdAt),
          } as FeedbackComment;
        }));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [institutionId]);

  const allFeedback: FeedbackComment[] = USE_MOCK ? (feedbackCommentsData as unknown as FeedbackComment[]) : liveFeedback;
  const filteredData = filterByInstitution(allFeedback, USE_MOCK ? null : institutionId);
  const paginatedData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: FeedbackComment) => {
    const subjectName = item.subjectId ? subjectNameById[item.subjectId] : undefined;
    const termName = item.termName || (item.termId ? termNameById[item.termId] : undefined);
    // A stored sentence (older documents) wins; otherwise build it from the comment numbers.
    const commentNumbers = (item as FeedbackComment & { commentNumbers?: unknown }).commentNumbers;
    const comment = item.comment || feedbackCommentText(commentNumbers, item.studentName, subjectName);
    return (
      <tr
        key={item.id}
        className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
      >
        <td className="flex items-center gap-4 p-4">{item.studentName ?? "—"}</td>
        <td className="hidden md:table-cell">{item.className ?? "—"}</td>
        <td className="hidden md:table-cell">{subjectName ?? "—"}</td>
        <td className="hidden md:table-cell">{termName ?? "—"}</td>
        <td className="hidden md:table-cell">{item.teacherName ?? "—"}</td>
        <td className="hidden md:table-cell">{conductLabel(item.conductGrade)}</td>
        <td className="max-w-xs">
          <span title={comment}>
            {comment.length > 80 ? comment.slice(0, 80) + "…" : comment || "—"}
          </span>
        </td>
        <td className="hidden md:table-cell">
          {formatDate(toIsoDate(item.createdAt))}
        </td>
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
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
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
      <Table columns={columns} renderRow={renderRow} data={paginatedData} loading={loading} />
      {/* PAGINATION */}
      <Pagination total={filteredData.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default FeedbackCommentListPage;
