import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { TableName } from "@/lib/formTables";
import NotAvailableYet from "./forms/NotAvailableYet";

// The Add/Edit form for each table the dialog (FormModal.tsx) can open. Every form is loaded on demand: the map holds
// one import() per table (a literal path, so the bundler still makes a chunk of each) and the lazy components are made
// once, here, from it. A table with no form of its own and not listed under PLACEHOLDER_TABLES gets "Form not found!".

type FormFieldValue = string | number | readonly string[] | undefined;
export type FormRecord = Record<string, FormFieldValue>;
type FormProps = { type: "create" | "update"; data?: FormRecord; onClose?: () => void };

const LOADERS: Partial<Record<TableName, () => Promise<{ default: ComponentType<FormProps> }>>> = {
  institution_admin: () => import("./forms/InstitutionAdminForm"),
  teacher: () => import("./forms/TeacherForm"),
  student: () => import("./forms/StudentForm"),
  subject: () => import("./forms/SubjectForm"),
  class: () => import("./forms/ClassForm"),
  exam: () => import("./forms/ExamForm"),
  assignment: () => import("./forms/AssignmentForm"),
  result: () => import("./forms/ResultForm"),
  parent: () => import("./forms/ParentForm"),
  term: () => import("./forms/TermForm"),
  feedback_comment: () => import("./forms/FeedbackCommentForm"),
  department: () => import("./forms/DepartmentForm"),
  timetable_slot: () => import("./forms/TimetableSlotForm"),
  house: () => import("./forms/HouseForm"),
  disciplinary_action: () => import("./forms/DisciplinaryActionForm"),
  rubric: () => import("./forms/RubricForm"),
  lesson_note: () => import("./forms/LessonNoteForm"),
};

// Nothing in the app writes these yet (forms/NotAvailableYet.tsx says so).
const PLACEHOLDER_TABLES: Partial<Record<TableName, string>> = {
  lesson: "lessons",
  event: "events",
  announcement: "announcements",
};

const LAZY_FORMS: Partial<Record<TableName, LazyExoticComponent<ComponentType<FormProps>>>> = Object.fromEntries(
  Object.entries(LOADERS).map(([table, load]) => [table, lazy(load!)]),
);

/** The form for a table, or null when there is none. */
export function renderForm(table: TableName, type: "create" | "update", data: FormRecord | undefined, onClose: () => void) {
  const placeholder = PLACEHOLDER_TABLES[table];
  if (placeholder) return <NotAvailableYet what={placeholder} onClose={onClose} />;
  const Form = LAZY_FORMS[table];
  return Form ? <Form type={type} data={data} onClose={onClose} /> : null;
}
