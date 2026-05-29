import React, { Suspense } from 'react';
import { useState } from "react";

// USE LAZY LOADING

// import TeacherForm from "./forms/TeacherForm";
// import StudentForm from "./forms/StudentForm";

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

type FormFieldValue = string | number | readonly string[] | undefined;
type FormRecord = Record<string, FormFieldValue>;
type FormRenderer = (type: "create" | "update", data?: FormRecord) => JSX.Element;

const forms: Partial<Record<TableName, FormRenderer>> = {
  teacher:      (type, data) => <TeacherForm type={type} data={data} />,
  student:      (type, data) => <StudentForm type={type} data={data} />,
  subject:      (type, data) => <SubjectForm type={type} data={data} />,
  class:        (type, data) => <ClassForm type={type} data={data} />,
  lesson:       (type, data) => <LessonForm type={type} data={data} />,
  exam:         (type, data) => <ExamForm type={type} data={data} />,
  assignment:   (type, data) => <AssignmentForm type={type} data={data} />,
  result:       (type, data) => <ResultForm type={type} data={data} />,
  event:        (type, data) => <EventForm type={type} data={data} />,
  announcement: (type, data) => <AnnouncementForm type={type} data={data} />,
  parent:       (type, data) => <ParentForm type={type} data={data} />,
};

type TableName =
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
  | "announcement";

const FormModal = ({
  table,
  type,
  data,
  id,
}: {
  table: TableName;
  type: "create" | "update" | "delete";
  data?: FormRecord;
  id?: number;
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
    return (
      <Suspense fallback={<div>Loading form...</div>}>
        {type === "delete" && id ? (
          <form action="" className="p-4 flex flex-col gap-4">
            <span className="text-center font-medium">
              All data will be lost. Are you sure you want to delete this {table}?
            </span>
            <button className="bg-red-700 text-white py-2 px-4 rounded-md border-none w-max self-center">
              Delete
            </button>
          </form>
        ) : (type === "create" || type === "update") && forms[table] ? (
          forms[table](type, data)
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
