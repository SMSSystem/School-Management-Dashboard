import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const ASSIGNMENT_TYPES = [
  'Homework', 'Classwork', 'Project', 'Presentation', 'Portfolio',
  'Research Paper', 'Essay', 'Field Work', 'Lab Report', 'Journal',
  'Case Study', 'In-Class Activity', 'ICT-based Task',
  'Self Assessment', 'Peer Assessment', 'Other',
] as const;

const schema = z.object({
  assignmentType: z.enum(ASSIGNMENT_TYPES, { errorMap: () => ({ message: "Assignment type is required." }) }),
  title: z.string().max(200).optional(),
  subjectId: z.string().nullable().optional(),
  classId: z.string().min(1, "Class is required."),
  termId: z.string().min(1, "Term is required."),
  dueDate: z.string().min(1, "Due date is required."),
  startDate: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.startDate && data.dueDate && data.startDate > data.dueDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Start date cannot be after due date.",
      path: ["startDate"],
    });
  }
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

interface SubjectRow { id: string; name: string; classIds: string[]; classNames: string[] }
interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; startDate: string; endDate: string }

const AssignmentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId, displayName } = useAuth();
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [allClasses, setAllClasses] = useState<ClassRow[]>([]);
  const [terms, setTerms] = useState<TermRow[]>([]);

  useEffect(() => {
    if (!institutionId) return;
    const q = role === 'regular_teacher' && user?.uid
      ? query(
          collection(db, 'subjects'),
          where('institutionId', '==', institutionId),
          where('teacherIds', 'array-contains', user.uid),
        )
      : query(collection(db, 'subjects'), where('institutionId', '==', institutionId));
    return onSnapshot(q, (snap) =>
      setSubjects(
        snap.docs
          .map((d) => ({
            id: d.id,
            name: d.data().name as string,
            classIds: (d.data().classIds as string[]) ?? [],
            classNames: (d.data().classNames as string[]) ?? [],
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }, [institutionId, role, user?.uid]);

  useEffect(() => {
    if (!institutionId) return;
    return onSnapshot(
      query(collection(db, 'classes'), where('institutionId', '==', institutionId)),
      (snap) =>
        setAllClasses(
          snap.docs
            .map((d) => ({ id: d.id, name: d.data().name as string }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
    );
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) return;
    return onSnapshot(
      query(collection(db, 'terms'), where('institutionId', '==', institutionId)),
      (snap) =>
        setTerms(
          snap.docs
            .filter((d) => d.data().status !== 'completed')
            .map((d) => ({
              id: d.id,
              name: d.data().name as string,
              startDate: d.data().startDate as string,
              endDate: d.data().endDate as string,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
    );
  }, [institutionId]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      assignmentType: data?.assignmentType as typeof ASSIGNMENT_TYPES[number] | undefined,
      title: (data?.title as string) ?? '',
      subjectId: (data?.subjectId as string | undefined) ?? null,
      classId: (data?.classId as string) ?? '',
      termId: (data?.termId as string) ?? '',
      dueDate: (data?.dueDate as string) ?? '',
      startDate: (data?.startDate as string) ?? '',
    },
  });

  const subjectId = watch('subjectId');
  const termId = watch('termId');
  const dueDate = watch('dueDate');
  const startDate = watch('startDate');

  // Auto-populate class when subject is selected (create only — avoid clobbering on edit)
  useEffect(() => {
    if (type !== 'create' || !subjectId) return;
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return;
    if (subject.classIds.length === 1) {
      setValue('classId', subject.classIds[0]);
    } else if (subject.classIds.length > 1) {
      setValue('classId', '');
    }
  }, [subjectId, subjects, setValue, type]);

  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const availableClasses: ClassRow[] =
    selectedSubject && selectedSubject.classIds.length > 0
      ? selectedSubject.classIds.map((id, i) => ({
          id,
          name: selectedSubject.classNames[i] ?? id,
        }))
      : allClasses;

  const selectedTerm = terms.find((t) => t.id === termId);
  const dateOutOfRange =
    !!selectedTerm &&
    !!(dueDate || startDate) &&
    ((!!dueDate && (dueDate < selectedTerm.startDate || dueDate > selectedTerm.endDate)) ||
      (!!startDate && (startDate < selectedTerm.startDate || startDate > selectedTerm.endDate)));

  const onSubmit = handleSubmit(async (formData) => {
    if (!user?.uid || !institutionId) return;
    const subject = subjects.find((s) => s.id === formData.subjectId);
    const cls = availableClasses.find((c) => c.id === formData.classId);

    const payload = {
      institutionId,
      assignmentType: formData.assignmentType,
      ...(formData.title ? { title: formData.title } : {}),
      termId: formData.termId,
      dueDate: formData.dueDate,
      ...(formData.startDate ? { startDate: formData.startDate } : {}),
      subjectId: formData.subjectId || null,
      subjectName: subject?.name ?? null,
      classId: formData.classId,
      className: cls?.name ?? '',
      teacherId: user.uid,
      teacherName: displayName ?? '',
      createdBy: user.uid,
    };

    if (type === 'create') {
      await addDoc(collection(db, 'assignments'), { ...payload, createdAt: serverTimestamp() });
    } else {
      const id = data?.id;
      if (typeof id !== 'string') return;
      await updateDoc(doc(db, 'assignments', id), payload);
    }
    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new assignment" : "Edit assignment"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Assignment Type</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("assignmentType")}
          >
            <option value="">— Select type —</option>
            {ASSIGNMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.assignmentType && (
            <p className="text-xs text-red-400">{errors.assignmentType.message}</p>
          )}
        </div>

        <InputField
          label="Title (optional)"
          name="title"
          defaultValue={data?.title as string | undefined}
          register={register}
          error={errors.title}
        />

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Subject (optional)</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("subjectId")}
          >
            <option value="">— General / No Subject —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Class</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("classId")}
          >
            <option value="">— Select class —</option>
            {availableClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.classId && (
            <p className="text-xs text-red-400">{errors.classId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("termId")}
          >
            <option value="">— Select term —</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.termId && (
            <p className="text-xs text-red-400">{errors.termId.message}</p>
          )}
        </div>

        <InputField
          label="Due Date"
          name="dueDate"
          type="date"
          defaultValue={data?.dueDate as string | undefined}
          register={register}
          error={errors.dueDate}
        />

        <InputField
          label="Start / Given Date (optional)"
          name="startDate"
          type="date"
          defaultValue={data?.startDate as string | undefined}
          register={register}
          error={errors.startDate}
        />
      </div>

      {dateOutOfRange && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          One or more dates fall outside the selected term's date range.
        </p>
      )}

      <p className="text-xs text-gray-500">
        Teacher:{" "}
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {displayName ?? user?.email ?? "—"}
        </span>
      </p>

      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default AssignmentForm;
