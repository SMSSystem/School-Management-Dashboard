import { useState } from "react";
import { FileText, Link as LinkIcon } from "lucide-react";
import FormModal from "@/components/FormModal";
import LessonNoteViewModal from "@/components/forms/LessonNoteViewModal";
import Pagination from "@/components/Pagination";
import Table from "@/components/Table";
import { useAuth } from "@/lib/AuthContext";
import { PAGE_SIZE } from "@/lib/utils";
import { LESSON_NOTES_LIMIT, useLessonNotes, type LessonNote } from "@/hooks/useLessonNotes";

type FormData = Record<string, string | number | readonly string[] | undefined>;

const columns = [
  { header: "Name", accessor: "name" },
  { header: "Class", accessor: "class", className: "hidden md:table-cell" },
  { header: "Subject", accessor: "subject", className: "hidden md:table-cell" },
  { header: "Teacher", accessor: "teacher", className: "hidden lg:table-cell" },
  { header: "Content", accessor: "content" },
  { header: "Actions", accessor: "action" },
];

// LESSON_NOTES_FEATURE_SPEC.md §7 — one role-aware page. Staff get the
// full table with create/edit/delete; students and parents get the same
// table read-only (their notes are already narrowed by useLessonNotes()).
const LessonNotesPage = () => {
  const { role, user } = useAuth();
  const [page, setPage] = useState(1);
  const { notes, loading, error, capped } = useLessonNotes();

  const isStaff =
    role === "institution_admin" || role === "senior_teacher" || role === "regular_teacher";

  // Mirrors firestore.rules: admin, the author, or a senior_teacher on a
  // same-department regular_teacher's note (useLessonNotes() only returns
  // those). The rules remain the real gate.
  const canModify = (n: LessonNote) =>
    role === "institution_admin" ||
    n.teacherId === user?.uid ||
    (role === "senior_teacher" && n.teacherRole === "regular_teacher");

  const heading = isStaff ? "Lesson Notes" : role === "student" ? "My Lessons" : "Lessons";
  const paginated = notes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderRow = (item: LessonNote) => (
    <tr
      key={item.id}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800"
    >
      <td className="p-4 font-medium">{item.name}</td>
      <td className="hidden md:table-cell">{item.className ?? "—"}</td>
      <td className="hidden md:table-cell">{item.subjectName ?? "—"}</td>
      <td className="hidden lg:table-cell">{item.teacherName}</td>
      <td>
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-300">
          {item.hasAttachment && (
            <span className="inline-flex items-center gap-1" title={item.attachmentFileName}>
              <FileText className="w-4 h-4" aria-label="Has file" />
            </span>
          )}
          {item.resourceLinks.length > 0 && (
            <span
              className="inline-flex items-center gap-1"
              title={`${item.resourceLinks.length} link${item.resourceLinks.length === 1 ? "" : "s"}`}
            >
              <LinkIcon className="w-4 h-4" aria-label="Has links" />
              {item.resourceLinks.length}
            </span>
          )}
        </div>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <LessonNoteViewModal note={item} />
          {isStaff && canModify(item) && (
            <>
              <FormModal
                table="lesson_note"
                type="update"
                data={item as unknown as FormData}
              />
              <FormModal table="lesson_note" type="delete" id={item.id} />
            </>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      {/* TOP */}
      <div className="flex items-center justify-between">
        <h1 className="hidden md:block text-lg font-semibold">{heading}</h1>
        <div className="flex items-center gap-4">
          {isStaff && <FormModal table="lesson_note" type="create" />}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {capped && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Showing the {LESSON_NOTES_LIMIT} most recent notes.
        </p>
      )}

      {/* LIST */}
      <Table columns={columns} renderRow={renderRow} data={paginated} loading={loading} />

      {/* PAGINATION */}
      <Pagination total={notes.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  );
};

export default LessonNotesPage;
