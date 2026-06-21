import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc, collection, doc, getDoc, onSnapshot,
  query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import InputField from "../InputField";
import { db, type GradingSystem } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),
  termId: z.string().min(1, "Term is required."),
  subjectId: z.string().min(1, "Subject is required."),
  assessmentType: z.enum(['coursework', 'exam'] as const, {
    message: "Assessment type is required.",
  }),
  assessmentName: z.string().min(1, "Assessment name is required.").max(100),
  score: z.coerce.number().min(0, "Score cannot be negative."),
  maxScore: z.coerce.number().min(1, "Max score must be at least 1."),
  weight: z.coerce.number().min(0).max(1).optional(),
  date: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.score > data.maxScore) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Score cannot exceed max score.",
      path: ["score"],
    });
  }
});

type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const ResultForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId } = useAuth();
  const [gradingSystem, setGradingSystem] = useState<GradingSystem>("flat");
  const [departmentId, setDepartmentId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [liveStudents, setLiveStudents] = useState<{ uid: string; name: string; classId?: string }[]>([]);
  const [liveTerms, setLiveTerms] = useState<{ id: string; name: string }[]>([]);
  const [liveSubjects, setLiveSubjects] = useState<{ id: string; name: string; classScope: string; classIds: string[] }[]>([]);
  const [liveClasses, setLiveClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<{ id: string; name: string; classScope: string; classIds: string[] } | null>(null);
  const [, setSelectedStudentClassId] = useState<string>("");
  const [studentHasNoClass, setStudentHasNoClass] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  // Fetch grading system and teacher's departmentId
  useEffect(() => {
    if (!institutionId) return;
    getDoc(doc(db, "institutions", institutionId)).then((snap) => {
      if (snap.exists()) setGradingSystem(snap.data().gradingSystem ?? "flat");
    });
    if (user?.uid) {
      getDoc(doc(db, "teachers", user.uid)).then((snap) => {
        if (snap.exists()) setDepartmentId(snap.data().departmentId ?? "");
      });
      getDoc(doc(db, "users", user.uid)).then((snap) => {
        if (snap.exists()) setTeacherName(snap.data().name ?? "");
      });
    }
  }, [institutionId, user?.uid]);

  // Live queries
  useEffect(() => {
    if (!institutionId) return;

    const unsubStudents = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId)),
      (snap) => setLiveStudents(snap.docs.map((d) => ({
        uid: d.id,
        name: d.data().name as string,
        classId: d.data().classId as string | undefined,
      }))),
    );

    const unsubTerms = onSnapshot(
      query(collection(db, 'terms'), where('institutionId', '==', institutionId)),
      (snap) => setLiveTerms(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    const unsubClasses = onSnapshot(
      query(collection(db, 'classes'), where('institutionId', '==', institutionId)),
      (snap) => setLiveClasses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    const subjectQuery = role === 'regular_teacher'
      ? query(
          collection(db, 'subjects'),
          where('institutionId', '==', institutionId),
          where('teacherIds', 'array-contains', user!.uid),
        )
      : query(collection(db, 'subjects'), where('institutionId', '==', institutionId));

    const unsubSubjects = onSnapshot(subjectQuery, (snap) =>
      setLiveSubjects(snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        classScope: d.data().classScope as string,
        classIds: (d.data().classIds ?? []) as string[],
      }))),
    );

    return () => {
      unsubStudents();
      unsubTerms();
      unsubClasses();
      unsubSubjects();
    };
  }, [institutionId, user?.uid, role]);

  // Pre-populate locked context fields in update mode
  useEffect(() => {
    if (type === 'update' && data) {
      if (data.studentId) setValue('studentId', data.studentId as string);
      if (data.classId) setValue('classId', data.classId as string);
      if (data.termId) setValue('termId', data.termId as string);
      if (data.assessmentType) setValue('assessmentType', data.assessmentType as 'coursework' | 'exam');
    }
  }, [type, data, setValue]);

  // Pre-populate student/classId in update mode once liveStudents loads
  useEffect(() => {
    if (type === 'update' && data?.studentId && liveStudents.length > 0) {
      setValue('studentId', data.studentId as string);
      const student = liveStudents.find((s) => s.uid === data.studentId as string);
      if (student?.classId) {
        setValue('classId', student.classId);
        setSelectedStudentClassId(student.classId);
      }
    }
  }, [liveStudents, type, data?.studentId, setValue]);

  // Pre-populate term in update mode once liveTerms loads
  useEffect(() => {
    if (type === 'update' && data?.termId && liveTerms.length > 0) {
      setValue('termId', data.termId as string);
    }
  }, [liveTerms, type, data?.termId, setValue]);

  // Pre-select subject in update mode once liveSubjects loads
  useEffect(() => {
    if (type === 'update' && data?.subjectId && liveSubjects.length > 0) {
      const sub = liveSubjects.find((s) => s.id === data.subjectId) ?? null;
      setSelectedSubject(sub);
      setValue('subjectId', data.subjectId as string);
    }
  }, [liveSubjects, type, data?.subjectId, setValue]);

  const studentOptions = useMemo(() => {
    if (!selectedSubject) return liveStudents;
    if (selectedSubject.classScope === 'institution') return liveStudents;
    if (selectedSubject.classIds.length === 0) return liveStudents;
    return liveStudents.filter((s) => selectedSubject.classIds.includes(s.classId ?? ''));
  }, [selectedSubject, liveStudents]);

  const onSubmit = handleSubmit(async (formData) => {
    try {
      if (type === "create") {
        const studentName = liveStudents.find((s) => s.uid === formData.studentId)?.name ?? "";
        const className = liveClasses.find((c) => c.id === formData.classId)?.name ?? "";
        await addDoc(collection(db, "results"), {
          ...formData,
          teacherId: user?.uid ?? "",
          teacherName,
          studentName,
          className,
          institutionId,
          departmentId,
          createdAt: serverTimestamp(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== "string") {
          console.log("ResultForm update: no string ID (mock mode)", formData);
          return;
        }
        await updateDoc(doc(db, "results", id), {
          subjectId: formData.subjectId,
          assessmentType: formData.assessmentType,
          assessmentName: formData.assessmentName,
          score: formData.score,
          maxScore: formData.maxScore,
          weight: formData.weight,
          date: formData.date,
          // studentId, classId, termId intentionally excluded — locked context fields
        });
      }
      onClose?.();
    } catch (err) {
      console.error("ResultForm submit error:", err);
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new result" : "Edit result"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">

        {/* Subject */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Subject</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("subjectId")}
            defaultValue={data?.subjectId as string | undefined}
            onChange={(e) => {
              setValue('subjectId', e.target.value);
              const sub = liveSubjects.find((s) => s.id === e.target.value) ?? null;
              setSelectedSubject(sub);
              setValue('studentId', '');
              setValue('classId', '');
              setSelectedStudentClassId('');
              setStudentHasNoClass(false);
            }}
          >
            <option value="">Select a subject</option>
            {liveSubjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.subjectId?.message && (
            <p className="text-xs text-red-400">{errors.subjectId.message.toString()}</p>
          )}
        </div>

        {/* Student */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Student</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("studentId")}
            defaultValue={data?.studentId as string | undefined}
            onChange={(e) => {
              setValue('studentId', e.target.value);
              const student = liveStudents.find((s) => s.uid === e.target.value);
              if (student) {
                if (student.classId) {
                  setValue('classId', student.classId);
                  setSelectedStudentClassId(student.classId);
                  setStudentHasNoClass(false);
                } else {
                  setValue('classId', '');
                  setSelectedStudentClassId('');
                  setStudentHasNoClass(true);
                }
              }
            }}
          >
            <option value="">Select a student</option>
            {studentOptions.map((s) => (
              <option key={s.uid} value={s.uid}>{s.name}</option>
            ))}
          </select>
          {errors.studentId?.message && (
            <p className="text-xs text-red-400">{errors.studentId.message.toString()}</p>
          )}
        </div>

        {/* classId — hidden, auto-derived from student selection */}
        <input
          type="hidden"
          {...register("classId")}
          defaultValue={data?.classId as string | undefined}
        />
        {studentHasNoClass && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500 dark:text-gray-300">
              Class <span className="text-orange-400">(student has no assigned class — select manually)</span>
            </label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              onChange={(e) => setValue('classId', e.target.value)}
            >
              <option value="">Select a class</option>
              {liveClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.classId?.message && (
              <p className="text-xs text-red-400">{errors.classId.message.toString()}</p>
            )}
          </div>
        )}

        {/* Term */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("termId")}
            defaultValue={data?.termId as string | undefined}
          >
            <option value="">Select a term</option>
            {liveTerms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.termId?.message && (
            <p className="text-xs text-red-400">{errors.termId.message.toString()}</p>
          )}
        </div>

        <InputField
          label="Assessment Name"
          name="assessmentName"
          defaultValue={data?.assessmentName}
          register={register}
          error={errors.assessmentName}
        />

        {/* Assessment Type */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Assessment Type</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("assessmentType")}
            defaultValue={data?.assessmentType as string | undefined}
          >
            <option value="">Select type</option>
            <option value="coursework">Course Work</option>
            <option value="exam">Exam / Test</option>
          </select>
          {errors.assessmentType?.message && (
            <p className="text-xs text-red-400">{errors.assessmentType.message.toString()}</p>
          )}
        </div>

        <InputField
          label="Score"
          name="score"
          type="number"
          defaultValue={data?.score}
          register={register}
          error={errors.score}
        />
        <InputField
          label="Max Score"
          name="maxScore"
          type="number"
          defaultValue={data?.maxScore}
          register={register}
          error={errors.maxScore}
        />
        {gradingSystem === "weighted" && (
          <InputField
            label="Weight (0–1)"
            name="weight"
            type="number"
            defaultValue={data?.weight}
            register={register}
            error={errors.weight}
          />
        )}
        <InputField
          label="Date"
          name="date"
          type="date"
          defaultValue={data?.date}
          register={register}
          error={errors.date}
        />
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ResultForm;
