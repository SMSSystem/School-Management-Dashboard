import { Suspense, useEffect, useState } from "react";
import { Copy, Plus, Pencil, Trash2, X } from "lucide-react";
import { useAuth } from '@/lib/AuthContext';
import { queryClient } from '@/lib/queryClient';
import { invalidateUserCounts } from '@/lib/invalidateUserCounts';
import { subjectEnrollmentsKey } from '@/lib/attendanceRows';
import { countAdditionalClassStudents } from '@/lib/classDeletion';
import {
  collectionNameFor,
  deleteDialogFor,
  REFERENCE_QUERY_TABLES,
  TABLE_LABELS,
  USERS_QUERY_TABLES,
  type DeletableTableName,
  type TableName,
} from '@/lib/formTables';
import { deleteRecord } from '@/lib/deleteRecord';
import { ExamDeleteBlockedError } from '@/lib/examDelete';
import { useExamDeletePreflight } from '@/hooks/useExamDeletePreflight';
import ExamDeleteNotice from './exam/ExamDeleteNotice';
import AssignmentDeleteNotice from './AssignmentDeleteNotice';
import { renderForm, type FormRecord } from './formRegistry';

// A create button may carry its own tooltip and a copy icon: Duplicate opens the create form filled in from another
// record (the Exams list uses it).
type CreateButtonLook = { triggerLabel?: string; triggerIcon?: "copy" };

// `touch` makes the button 44 px, for a finger (the Exams list's cards on a phone); without it the button is the size it has always been.
type FormModalProps =
  | ({ table: TableName; type: "create" | "update"; data?: FormRecord; id?: number | string; onClose?: () => void; touch?: boolean } & CreateButtonLook)
  | { table: DeletableTableName; type: "delete"; data?: FormRecord; id?: number | string; onClose?: () => void; touch?: boolean };

// Hoisted to module scope (was previously declared inside FormModal's own
// body as `const Form = () => {...}`) — a function redeclared on every
// render of its parent is a *new component type* to React, which forces a
// full unmount/remount of everything inside it whenever FormModal re-renders
// with new props. That happens more often than it looks like it should: any
// list page subscribed to a raw (uncached) onSnapshot re-renders with a
// fresh `data` object after every write, including the write this very form
// just made — remounting the modal's own contents (Suspense fallback flash,
// state reset) a few milliseconds before its own auto-close timer fires.
// Houses is the clearest case (the dev-notes plan that found it is not kept in the repository), but
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
  return (
    <Suspense fallback={<div>Loading form...</div>}>
      {type === "delete" && id ? (
        <DeleteConfirm table={table} data={data} id={id} closeModal={closeModal} />
      ) : (type === "create" || type === "update") ? (
        (renderForm(table, type, data, closeModal) ?? "Form not found!")
      ) : (
        "Form not found!"
      )}
    </Suspense>
  );
};

// Deleting a class also takes it out of the students who have it as an additional class: how many, for the dialog.
function useAdditionalClassStudents(table: TableName, id: number | string, institutionId: string | null): number | null {
  const [additionalStudents, setAdditionalStudents] = useState<number | null>(null);
  useEffect(() => {
    if (table !== "class" || !institutionId) return;
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
  }, [table, id, institutionId]);
  return additionalStudents;
}

// The Delete confirmation: the table's own wording, what goes with the record, and the buttons.
function DeleteConfirm({
  table,
  data,
  id,
  closeModal,
}: {
  table: TableName;
  data?: FormRecord;
  id: number | string;
  closeModal: () => void;
}) {
  const { institutionId, user, displayName } = useAuth();
  const dialog = deleteDialogFor(table);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const additionalStudents = useAdditionalClassStudents(table, id, institutionId);

  // An online exam takes its questions, attempts and grades with it, and is not deleted while students are sitting it.
  const examDelete = useExamDeletePreflight(institutionId, String(id), table === "exam" && Boolean(data?.online));
  const examBlocked = examDelete.state === "loading" || (examDelete.state === "ready" && examDelete.sitting > 0);

  return (
        <div className="p-4 flex flex-col gap-4">
          {dialog.heading && <h2 className="text-lg font-semibold text-center">{dialog.heading}</h2>}
          {dialog.paragraphs ? (
            <>
              {dialog.paragraphs.map((text) => (
                <p key={text} className="text-center text-sm text-gray-700 dark:text-gray-300">
                  {text}
                </p>
              ))}
            </>
          ) : (
            <span className="text-center font-medium">{dialog.message}</span>
          )}
          <AdditionalClassNote count={additionalStudents} />
          {table === "exam" && <ExamDeleteNotice preflight={examDelete} />}
          <AssignmentDeleteNotice table={table} institutionId={institutionId} assignmentId={String(id)} />
          {deleteError && (
            <p className="text-red-500 text-center text-sm">{deleteError}</p>
          )}
          <div className="flex gap-3 justify-center">
            {dialog.cancelLabel && (
              <button
                type="button"
                className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                onClick={closeModal}
              >
                {dialog.cancelLabel}
              </button>
            )}
            <button
              type="button"
              disabled={deleting || examBlocked}
              className="bg-red-700 text-white py-2 px-4 rounded-md border-none w-max self-center disabled:opacity-50"
              onClick={async () => {
                setDeleting(true);
                setDeleteError(null);
                try {
                  await deleteRecord(table, institutionId!, String(id), user ? { uid: user.uid, name: displayName ?? "" } : undefined);
                  closeModal();
                } catch (err) {
                  setDeleteError(err instanceof ExamDeleteBlockedError ? err.message : "Failed to delete. Please try again.");
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : dialog.confirmLabel}
            </button>
          </div>
        </div>
  );
}

function AdditionalClassNote({ count }: { count: number | null }) {
  if (!count) return null;
  return (
    <p className="text-center text-sm text-gray-700 dark:text-gray-300">
      {count} {count === 1 ? "student has" : "students have"} this class as an additional class; it will be removed from them.
    </p>
  );
}

// What the trigger button says: the caller's own tooltip, or Add new / Edit (by name when there is one) / Delete.
function triggerLabelFor(table: TableName, type: FormModalProps["type"], data: FormRecord | undefined, look: CreateButtonLook): string {
  const tableLabel = TABLE_LABELS[table] ?? table;
  // Edit stays record-specific when a name is available; delete stays
  // generic regardless — a destructive action's tooltip staying short and
  // consistent matters more than naming the record.
  const editLabel = `Edit ${(data?.name as string | undefined) ?? tableLabel}`;
  const createLabel = `Add new ${tableLabel}`;
  const deleteLabel = `Delete ${tableLabel}`;
  return look.triggerLabel ?? (type === "create" ? createLabel : type === "update" ? editLabel : deleteLabel);
}

function TriggerIcon({ type, look }: { type: FormModalProps["type"]; look: CreateButtonLook }) {
  return (
    <>
        {type === "create" && look.triggerIcon === "copy" && <Copy className="w-3.5 h-3.5 text-white" />}
        {type === "create" && !look.triggerIcon && <Plus className="w-4 h-4 text-white" />}
        {type === "update" && <Pencil className="w-3.5 h-3.5 text-white" />}
        {type === "delete" && <Trash2 className="w-3.5 h-3.5 text-white" />}
    </>
  );
}

// Fires on every close — save, cancel, or the X button — not just a
// successful save. A caller using this to invalidate cached display data
// (e.g. a list page's per-row photo cache) takes one harmless extra read
// on cancel in exchange for not needing to distinguish "closed after a
// real change" from "closed without one."
function invalidateAfterClose(table: TableName, institutionId: string | null): void {
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
}

const FormModal = (props: FormModalProps) => {
  const { table, type, data, id, onClose } = props;
  const look: CreateButtonLook = "triggerIcon" in props || "triggerLabel" in props ? (props as CreateButtonLook) : {};
  const size = props.touch ? "w-11 h-11" : type === "create" && !look.triggerIcon ? "w-8 h-8" : "w-7 h-7";
  const { institutionId } = useAuth();

  const triggerLabel = triggerLabelFor(table, type, data, look);

  const [open, setOpen] = useState(false);
  const closeModal = () => {
    setOpen(false);
    invalidateAfterClose(table, institutionId);
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
        <TriggerIcon type={type} look={look} />
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
