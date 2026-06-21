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

const EXAM_TYPES = [
  'Test', 'Open-Book', 'Mock', 'Quiz',
  'Midterm', 'End-of-Term', 'End-of-Year', 'Other',
] as const;

const schema = z.object({
  examType: z.enum(EXAM_TYPES, { errorMap: () => ({ message: "Exam type is required." }) }),
  title: z.string().min(1, "Title is required.").max(200),
  subjectId: z.string().nullable().optional(),
  classId: z.string().min(1, "Class is required."),
  termId: z.string().min(1, "Term is required."),
  occurrenceDate: z.string().min(1, "Date is required."),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

interface SubjectRow { id: string; name: string; classIds: string[]; classNames: string[] }
interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string; startDate: string; endDate: string }

const ExamForm = ({
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
      examType: data?.examType as typeof EXAM_TYPES[number] | undefined,
      title: (data?.title as string) ?? '',
      subjectId: (data?.subjectId as string | undefined) ?? null,
      classId: (data?.classId as string) ?? '',
      termId: (data?.termId as string) ?? '',
      occurrenceDate: (data?.occurrenceDate as string) ?? '',
    },
  });

  const subjectId = watch('subjectId');
  const termId = watch('termId');
  const occurrenceDate = watch('occurrenceDate');

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
    !!occurrenceDate &&
    (occurrenceDate < selectedTerm.startDate || occurrenceDate > selectedTerm.endDate);

  const onSubmit = handleSubmit(async (formData) => {
    if (!user?.uid || !institutionId) return;
    const subject = subjects.find((s) => s.id === formData.subjectId);
    const cls = availableClasses.find((c) => c.id === formData.classId);

    const payload = {
      institutionId,
      examType: formData.examType,
      title: formData.title,
      termId: formData.termId,
      occurrenceDate: formData.occurrenceDate,
      subjectId: formData.subjectId || null,
      subjectName: subject?.name ?? null,
      classId: formData.classId,
      className: cls?.name ?? '',
      teacherId: user.uid,
      teacherName: displayName ?? '',
      createdBy: user.uid,
    };

    if (type === 'create') {
      await addDoc(collection(db, 'exams'), { ...payload, createdAt: serverTimestamp() });
    } else {
      const id = data?.id;
      if (typeof id !== 'string') return;
      await updateDoc(doc(db, 'exams', id), payload);
    }
    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new exam" : "Edit exam"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Exam Type</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("examType")}
          >
            <option value="">— Select type —</option>
            {EXAM_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.examType && (
            <p className="text-xs text-red-400">{errors.examType.message}</p>
          )}
        </div>

        <InputField
          label="Title"
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
          label="Date"
          name="occurrenceDate"
          type="date"
          defaultValue={data?.occurrenceDate as string | undefined}
          register={register}
          error={errors.occurrenceDate}
        />
      </div>

      {dateOutOfRange && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Date falls outside the selected term's date range.
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

export default ExamForm;
