import React, { Suspense } from 'react';
import { useState } from "react";
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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

type FormFieldValue = string | number | readonly string[] | undefined;
type FormRecord = Record<string, FormFieldValue>;
type FormRenderer = (type: "create" | "update", data?: FormRecord, onClose?: () => void) => JSX.Element;

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
  | "house";

const collectionNameFor = (table: TableName): string => {
  const overrides: Partial<Record<TableName, string>> = {
    institution_admin: "users",
    class: "classes",
    attendance: "attendance",
  };
  return overrides[table] ?? `${table}s`;
};

const FormModal = ({
  table,
  type,
  data,
  id,
}: {
  table: TableName;
  type: "create" | "update" | "delete";
  data?: FormRecord;
  id?: number | string;
}) => {
  const size = type === "create" ? "w-8 h-8" : "w-7 h-7";
  const bgColor =
    type === "create"
      ? "bg-lamaYellow"
      : type === "update"
      ? "bg-lamaSky"
      : "bg-lamaPurple";

  const [open, setOpen] = useState(false);

  const Form = () => {
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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
            ) : (
              <span className="text-center font-medium">
                All data will be lost. Are you sure you want to delete this {table}?
              </span>
            )}
            {deleteError && (
              <p className="text-red-500 text-center text-sm">{deleteError}</p>
            )}
            <div className="flex gap-3 justify-center">
              {table === "subject" && (
                <button
                  type="button"
                  className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
                  onClick={() => setOpen(false)}
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
                    await deleteDoc(doc(db, collectionNameFor(table), String(id)));
                    setOpen(false);
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
          forms[table](type, data, () => setOpen(false))
        ) : (
          "Form not found!"
        )}
      </Suspense>
    );
  };

  return (
    <>
      <button
        className={`${size} flex items-center justify-center rounded-full ${bgColor}`}
        onClick={() => setOpen(true)}
      >
        <img src={`/${type}.png`} alt="" width={16} height={16} />
      </button>
      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-md relative w-full max-w-4xl max-h-[90dvh] overflow-y-auto">
            <Form />
            <div
              className="absolute top-4 right-4 cursor-pointer"
              onClick={() => setOpen(false)}
            >
              <img src="/close.png" alt="" width={14} height={14} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FormModal;
