import React, { Suspense } from 'react';
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { deleteDoc, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import { deleteBlob } from '@/lib/blobStore';
import { noteFileDocs } from '@/lib/lessonNoteFile';
import { existingAssignmentBlobKey } from '@/lib/assignmentFile';
import { queryClient } from '@/lib/queryClient';
import { invalidateUserCounts } from '@/lib/invalidateUserCounts';
import { subjectEnrollmentsKey } from '@/lib/attendanceRows';
import { countAdditionalClassStudents, removeClassFromStudents } from '@/lib/classDeletion';

// USE LAZY LOADING

// import TeacherForm from "./forms/TeacherForm";
// import StudentForm from "./forms/StudentForm";

const InstitutionAdminForm = React.lazy(() => import("./forms/InstitutionAdminForm"));
const TeacherForm      = React.lazy(() => import("./forms/TeacherForm"));
const StudentForm      = React.lazy(() => import("./forms/StudentForm"));
const SubjectForm      = React.lazy(() => import("./forms/SubjectForm"));
const ClassForm        = React.lazy(() => import("./forms/ClassForm"));
const LessonForm       = React.lazy(() => import("./forms/LessonForm"));
const ExamForm         = React.lazy(() => import("./forms/ExamForm"));
const AssignmentForm   = React.lazy(() => import("./forms/AssignmentForm"));
const ResultForm       = React.lazy(() => import("./forms/ResultForm"));
const EventForm        = React.lazy(() => import("./forms/EventForm"));
const AnnouncementForm = React.lazy(() => import("./forms/AnnouncementForm"));
const ParentForm       = React.lazy(() => import("./forms/ParentForm"));
const TermForm              = React.lazy(() => import("./forms/TermForm"));
const FeedbackCommentForm   = React.lazy(() => import("./forms/FeedbackCommentForm"));
const DepartmentForm        = React.lazy(() => import("./forms/DepartmentForm"));
const TimetableSlotForm     = React.lazy(() => import("./forms/TimetableSlotForm"));
const HouseForm             = React.lazy(() => import("./forms/HouseForm"));
const DisciplinaryActionForm = React.lazy(() => import("./forms/DisciplinaryActionForm"));
const RubricForm             = React.lazy(() => import("./forms/RubricForm"));
const LessonNoteForm         = React.lazy(() => import("./forms/LessonNoteForm"));

type FormFieldValue = string | number | readonly string[] | undefined;
type FormRecord = Record<string, FormFieldValue>;
type FormRenderer = (type: "create" | "update", data?: FormRecord, onClose?: () => void) => React.JSX.Element;

const forms: Partial<Record<TableName, FormRenderer>> = {
  institution_admin: (type, data, onClose) => <InstitutionAdminForm type={type} data={data} onClose={onClose} />,
  teacher:      (type, data, onClose) => <TeacherForm type={type} data={data} onClose={onClose} />,
  student:      (type, data, onClose) => <StudentForm type={type} data={data} onClose={onClose} />,
  subject:      (type, data, onClose) => <SubjectForm type={type} data={data} onClose={onClose} />,
  class:        (type, data, onClose) => <ClassForm type={type} data={data} onClose={onClose} />,
  lesson:       (type, data, onClose) => <LessonForm type={type} data={data} onClose={onClose} />,
  exam:         (type, data, onClose) => <ExamForm type={type} data={data} onClose={onClose} />,
  assignment:   (type, data, onClose) => <AssignmentForm type={type} data={data} onClose={onClose} />,
  result:       (type, data, onClose) => <ResultForm type={type} data={data} onClose={onClose} />,
  event:        (type, data, onClose) => <EventForm type={type} data={data} onClose={onClose} />,
  announcement: (type, data, onClose) => <AnnouncementForm type={type} data={data} onClose={onClose} />,
  parent:       (type, data, onClose) => <ParentForm type={type} data={data} onClose={onClose} />,
  term:             (type, data, onClose) => <TermForm type={type} data={data} onClose={onClose} />,
  feedback_comment: (type, data, onClose) => <FeedbackCommentForm type={type} data={data} onClose={onClose} />,
  department:       (type, data, onClose) => <DepartmentForm type={type} data={data} onClose={onClose} />,
  timetable_slot:   (type, data, onClose) => <TimetableSlotForm type={type} data={data} onClose={onClose} />,
  house:            (type, data, onClose) => <HouseForm type={type} data={data} onClose={onClose} />,
  disciplinary_action: (type, data, onClose) => <DisciplinaryActionForm type={type} data={data} onClose={onClose} />,
  rubric:           (type, data, onClose) => <RubricForm type={type} data={data} onClose={onClose} />,
  lesson_note:      (type, data, onClose) => <LessonNoteForm type={type} data={data} onClose={onClose} />,
};

type TableName =
  | "institution_admin"
  | "teacher"
  | "student"
  | "parent"
  | "subject"
  | "class"
  | "lesson"
  | "exam"
  | "assignment"
  | "result"
  | "attendance"
  | "event"
  | "announcement"
  | "term"
  | "feedback_comment"
  | "department"
  | "timetable_slot"
  | "house"
  | "disciplinary_action"
  | "progress_report"
  | "rubric"
  | "lesson_note";

const collectionNameFor = (table: TableName): string => {
  const overrides: Partial<Record<TableName, string>> = {
    institution_admin: "users",
    class: "classes",
    lesson_note: "lessonNotes",
    attendance: "attendance",
    disciplinary_action: "disciplinaryActions",
    progress_report: "progressReports",
  };
  return overrides[table] ?? `${table}s`;
};

// Tables whose collection is still flat, never migrated under
// institutions/{id}/... — shrinks as later phases land. Everything else is
// nested; defaulting to nested (rather than flat) means a table that gets
// migrated but forgotten here fails loudly via institutionDoc()'s own
// invalid-institutionId guard, instead of silently deleting nothing against
// a stale flat path.
const FLAT_TABLES = new Set<TableName>([
  "institution_admin",
  "teacher",
  "student",
  "parent",
  "attendance",
]);

type DeletableTableName = Exclude<TableName, "teacher" | "student" | "parent">;

// Human-readable labels for the title/aria-label on the icon-only trigger
// button — only tables whose raw snake_case name wouldn't read naturally
// need an override; everything else falls back to the table name as-is.
const TABLE_LABELS: Partial<Record<TableName, string>> = {
  institution_admin: "institution admin",
  feedback_comment: "feedback comment",
  timetable_slot: "timetable slot",
  disciplinary_action: "disciplinary action",
  progress_report: "progress report",
  lesson_note: "lesson note",
};

// Tables sharing the useInstitutionUsers() cached query (Phase 2 pilot,
// FIRESTORE_READ_CACHING_SPEC.md §4) — all write to the same `users`
// collection, so a create/update/delete on any one of them must invalidate
// the one shared cache entry every consumer reads from.
const USERS_QUERY_TABLES = new Set<TableName>(["student", "teacher", "parent", "institution_admin"]);

// Tables backed by one of the Phase 3a reference-data hooks
// (FIRESTORE_READ_CACHING_SPEC.md §5.1) — collectionNameFor(table) already
// matches each hook's queryKey prefix (["terms", institutionId], etc.), so
// one invalidateQueries call covers it; for `subject`, the default
// (non-exact) match also catches every role-scoped
// ["subjects", institutionId, "teacher", uid] entry, since a prefix match
// is invalidateQueries' default behavior.
const REFERENCE_QUERY_TABLES = new Set<TableName>(["term", "class", "subject", "department", "house"]);

type FormModalProps =
  | { table: TableName; type: "create" | "update"; data?: FormRecord; id?: number | string; onClose?: () => void }
  | { table: DeletableTableName; type: "delete"; data?: FormRecord; id?: number | string; onClose?: () => void };

// Hoisted to module scope (was previously declared inside FormModal's own
// body as `const Form = () => {...}`) — a function redeclared on every
// render of its parent is a *new component type* to React, which forces a
// full unmount/remount of everything inside it whenever FormModal re-renders
// with new props. That happens more often than it looks like it should: any
// list page subscribed to a raw (uncached) onSnapshot re-renders with a
// fresh `data` object after every write, including the write this very form
// just made — remounting the modal's own contents (Suspense fallback flash,
// state reset) a few milliseconds before its own auto-close timer fires.
// Houses is the clearest case (DEV_NOTES_IMPLEMENTATION_PLAN.md §1.2), but
// the defect was general-purpose, affecting every table using this modal.
const FormModalBody = ({
  type,
  table,
  data,
  id,
  closeModal,
}: {
  type: "create" | "update" | "delete";
  table: TableName;
  data?: FormRecord;
  id?: number | string;
  closeModal: () => void;
}) => {
  const { institutionId } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Deleting a class also takes it out of the students who have it as an additional class.
  const [additionalStudents, setAdditionalStudents] = useState<number | null>(null);
  useEffect(() => {
    if (type !== "delete" || table !== "class" || !id || !institutionId) return;
    let cancelled = false;
    countAdditionalClassStudents(institutionId, String(id)).then(
      (n) => {
        if (!cancelled) setAdditionalStudents(n);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [type, table, id, institutionId]);

  return (
    <Suspense fallback={<div>Loading form...</div>}>
      {type === "delete" && id ? (
        <div className="p-4 flex flex-col gap-4">
          {table === "subject" && (
            <h2 className="text-lg font-semibold text-center">Confirm Deletion</h2>
          )}
          {table === "subject" ? (
            <>
              <p className="text-center text-sm text-gray-700 dark:text-gray-300">
                All data related to this subject will be lost.
              </p>
              <p className="text-center text-sm text-gray-700 dark:text-gray-300">
                Deleting this subject will prevent teachers assigned to it from editing any results or feedback comments that reference it.
              </p>
            </>
          ) : table === "disciplinary_action" ? (
            <span className="text-center font-medium">
              This will permanently remove this disciplinary record.
            </span>
          ) : table === "progress_report" ? (
            <span className="text-center font-medium">
              This will permanently remove this progress report snapshot.
            </span>
          ) : table === "lesson_note" ? (
            <span className="text-center font-medium">
              This will permanently remove this lesson note and its attached file.
            </span>
          ) : table === "rubric" ? (
            <span className="text-center font-medium">
              Any assignment still referencing this rubric will show it as
              missing rather than error — rubric references aren't
              automatically cleaned up.
            </span>
          ) : (
            <span className="text-center font-medium">
              All data will be lost. Are you sure you want to delete this {table}?
            </span>
          )}
          {table === "class" && additionalStudents !== null && additionalStudents > 0 && (
            <p className="text-center text-sm text-gray-700 dark:text-gray-300">
              {additionalStudents} {additionalStudents === 1 ? "student has" : "students have"} this class as an additional class; it will be removed from them.
            </p>
          )}
          {deleteError && (
            <p className="text-red-500 text-center text-sm">{deleteError}</p>
          )}
          <div className="flex gap-3 justify-center">
            {table === "subject" && (
              <button
                type="button"
                className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                onClick={closeModal}
              >
                No, cancel
              </button>
            )}
            <button
              type="button"
              disabled={deleting}
              className="bg-red-700 text-white py-2 px-4 rounded-md border-none w-max self-center disabled:opacity-50"
              onClick={async () => {
                setDeleting(true);
                setDeleteError(null);
                try {
                  if (table === "lesson_note") {
                    // Firestore doesn't cascade: each file lives in its own
                    // sub-document (up to five), so they're all removed in the same
                    // batch (also clears an orphan if one ever exists).
                    const noteRef = institutionDoc(institutionId!, "lessonNotes", String(id));
                    // A file over 500KB lives in the Realtime Database: read the keys
                    // first (the sub-documents are about to go), and remove those
                    // files only once the records are gone.
                    const files = await noteFileDocs(institutionId!, String(id));
                    const batch = writeBatch(db);
                    files.forEach((f) => batch.delete(doc(noteRef, "attachment", f.id)));
                    batch.delete(noteRef);
                    await batch.commit();
                    for (const f of files) if (f.blobKey) void deleteBlob(institutionId!, f.blobKey);
                    closeModal();
                    return;
                  }
                  if (table === "subject") {
                    // Firestore doesn't cascade: the subject's enrollments
                    // (subjectEnrollments/{subjectId}_{classId}) are removed in the same
                    // batch. Left behind, they kept showing a deleted subject in every
                    // enrolled student's "By Subject" attendance.
                    const enrollments = await getDocs(
                      query(
                        institutionCollection(institutionId!, "subjectEnrollments"),
                        where("subjectId", "==", String(id)),
                      ),
                    );
                    const batch = writeBatch(db);
                    enrollments.docs.forEach((d) => batch.delete(d.ref));
                    batch.delete(institutionDoc(institutionId!, collectionNameFor(table), String(id)));
                    await batch.commit();
                    closeModal();
                    return;
                  }
                  if (table === "assignment") {
                    // A teacher file over 500KB lives in the Realtime Database; its
                    // key is on the assignment, so read it first and remove the
                    // file only once the assignment is gone.
                    const blobKey = await existingAssignmentBlobKey(institutionId!, String(id));
                    await deleteDoc(institutionDoc(institutionId!, collectionNameFor(table), String(id)));
                    if (blobKey) void deleteBlob(institutionId!, blobKey);
                    closeModal();
                    return;
                  }
                  if (table === "class") {
                    // The class goes from students' additional classes first; the class document last.
                    await removeClassFromStudents(institutionId!, String(id));
                    queryClient.invalidateQueries({ queryKey: ["users", institutionId] });
                    invalidateUserCounts(institutionId);
                  }
                  const ref = FLAT_TABLES.has(table)
                    ? doc(db, collectionNameFor(table), String(id))
                    : institutionDoc(institutionId!, collectionNameFor(table), String(id));
                  await deleteDoc(ref);
                  closeModal();
                } catch {
                  setDeleteError("Failed to delete. Please try again.");
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : table === "subject" ? "Yes, delete" : "Delete"}
            </button>
          </div>
        </div>
      ) : (type === "create" || type === "update") && forms[table] ? (
        forms[table](type, data, closeModal)
      ) : (
        "Form not found!"
      )}
    </Suspense>
  );
};

const FormModal = ({ table, type, data, id, onClose }: FormModalProps) => {
  const size = type === "create" ? "w-8 h-8" : "w-7 h-7";
  const { institutionId } = useAuth();

  const tableLabel = TABLE_LABELS[table] ?? table;
  // Edit stays record-specific when a name is available; delete stays
  // generic regardless — a destructive action's tooltip staying short and
  // consistent matters more than naming the record.
  const editLabel = `Edit ${(data?.name as string | undefined) ?? tableLabel}`;
  const createLabel = `Add new ${tableLabel}`;
  const deleteLabel = `Delete ${tableLabel}`;
  const triggerLabel =
    type === "create" ? createLabel : type === "update" ? editLabel : deleteLabel;

  const [open, setOpen] = useState(false);
  // Fires on every close — save, cancel, or the X button — not just a
  // successful save. A caller using this to invalidate cached display data
  // (e.g. a list page's per-row photo cache) takes one harmless extra read
  // on cancel in exchange for not needing to distinguish "closed after a
  // real change" from "closed without one."
  const closeModal = () => {
    setOpen(false);
    if (USERS_QUERY_TABLES.has(table)) {
      queryClient.invalidateQueries({ queryKey: ["users", institutionId] });
      // Dashboard head-counts and the Classes "Population" column.
      invalidateUserCounts(institutionId);
      // The Class detail page's enrolled-students list is its own cached query.
      queryClient.invalidateQueries({ queryKey: ["classStudents", institutionId] });
    }
    if (REFERENCE_QUERY_TABLES.has(table)) {
      queryClient.invalidateQueries({ queryKey: [collectionNameFor(table), institutionId] });
    }
    // (A house save that reassigns students refreshes the users list itself, in HouseForm, so cancelling the form
    // does not make the next opening read every student again.)
    // The Subject form writes the enrollments that My Attendance and Child Attendance read (their own cache root).
    if (table === "subject") {
      queryClient.invalidateQueries({ queryKey: subjectEnrollmentsKey(institutionId ?? "") });
    }
    onClose?.();
  };

  return (
    <>
      <button
        className={`${size} flex items-center justify-center rounded-full`}
        style={{ backgroundColor: 'var(--brand-button-bg, #0284c7)' }}
        onClick={() => setOpen(true)}
        title={triggerLabel}
        aria-label={triggerLabel}
      >
        {type === "create" && <Plus className="w-4 h-4 text-white" />}
        {type === "update" && <Pencil className="w-3.5 h-3.5 text-white" />}
        {type === "delete" && <Trash2 className="w-3.5 h-3.5 text-white" />}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-md relative w-full max-w-5xl max-h-[90dvh] overflow-y-auto">
            <FormModalBody type={type} table={table} data={data} id={id} closeModal={closeModal} />
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors"
              onClick={closeModal}
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default FormModal;
