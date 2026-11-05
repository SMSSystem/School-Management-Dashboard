// The tables the Add/Edit/Delete dialog (components/FormModal.tsx) works on: their names, the collection each one
// lives in, which are still flat, their button labels, which caches a change must refresh, and what each Delete
// dialog says. No Firebase import, so tests can read it.

export type TableName =
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

export const collectionNameFor = (table: TableName): string => {
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
export const FLAT_TABLES = new Set<TableName>([
  "institution_admin",
  "teacher",
  "student",
  "parent",
  "attendance",
]);

export type DeletableTableName = Exclude<
  TableName,
  "teacher" | "student" | "parent"
>;

// Human-readable labels for the title/aria-label on the icon-only trigger
// button — only tables whose raw snake_case name wouldn't read naturally
// need an override; everything else falls back to the table name as-is.
export const TABLE_LABELS: Partial<Record<TableName, string>> = {
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
export const USERS_QUERY_TABLES = new Set<TableName>([
  "student",
  "teacher",
  "parent",
  "institution_admin",
]);

// Tables backed by one of the Phase 3a reference-data hooks
// (FIRESTORE_READ_CACHING_SPEC.md §5.1) — collectionNameFor(table) already
// matches each hook's queryKey prefix (["terms", institutionId], etc.), so
// one invalidateQueries call covers it; for `subject`, the default
// (non-exact) match also catches every role-scoped
// ["subjects", institutionId, "teacher", uid] entry, since a prefix match
// is invalidateQueries' default behavior.
export const REFERENCE_QUERY_TABLES = new Set<TableName>([
  "term",
  "class",
  "subject",
  "department",
  "house",
]);

/** What the Delete dialog says and offers for a table (components/FormModal.tsx renders it). */
export type DeleteDialog = {
  /** A heading above the text (only the subject has one). */
  heading?: string;
  /** Several paragraphs, or ... */
  paragraphs?: string[];
  /** ... one line. */
  message?: string;
  /** A "no" button next to the confirm button (only the subject has one). */
  cancelLabel?: string;
  confirmLabel: string;
};

export function deleteDialogFor(table: TableName): DeleteDialog {
  switch (table) {
    case "subject":
      return {
        heading: "Confirm Deletion",
        paragraphs: [
          "All data related to this subject will be lost.",
          "Deleting this subject will prevent teachers assigned to it from editing any results or feedback comments that reference it.",
        ],
        cancelLabel: "No, cancel",
        confirmLabel: "Yes, delete",
      };
    case "disciplinary_action":
      return {
        message: "This will permanently remove this disciplinary record.",
        confirmLabel: "Delete",
      };
    case "progress_report":
      return {
        message: "This will permanently remove this progress report snapshot.",
        confirmLabel: "Delete",
      };
    case "lesson_note":
      return {
        message:
          "This will permanently remove this lesson note and its attached file.",
        confirmLabel: "Delete",
      };
    case "rubric":
      return {
        message:
          "This also deletes any uploaded file. Any assignment still referencing this rubric will show it as missing rather than error — rubric references aren't automatically cleaned up.",
        confirmLabel: "Delete",
      };
    default:
      return {
        message: `All data will be lost. Are you sure you want to delete this ${table}?`,
        confirmLabel: "Delete",
      };
  }
}
