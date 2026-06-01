import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import InputField from "../InputField";
import { db, type GradingSystem } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { studentsData, classesData, termsData } from "@/lib/data";

const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),
  termId: z.string().min(1, "Term is required."),
  assessmentName: z.string().min(1, "Assessment name is required.").max(100),
  score: z.coerce.number().min(0, "Score cannot be negative."),
  maxScore: z.coerce.number().min(1, "Max score must be at least 1."),
  weight: z.coerce.number().min(0).max(1).optional(),
  date: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const ResultForm = ({
  type,
  data,
}: {
  type: "create" | "update";
  data?: FormData;
}) => {
  const { user, institutionId } = useAuth();
  const [gradingSystem, setGradingSystem] = useState<GradingSystem>("flat");
  const [departmentId, setDepartmentId] = useState("");

  useEffect(() => {
    if (!institutionId) return;
    getDoc(doc(db, "institutions", institutionId)).then((snap) => {
      if (snap.exists()) setGradingSystem(snap.data().gradingSystem ?? "flat");
    });
    if (user?.uid) {
      getDoc(doc(db, "teachers", user.uid)).then((snap) => {
        if (snap.exists()) setDepartmentId(snap.data().departmentId ?? "");
      });
    }
  }, [institutionId, user?.uid]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (formData) => {
    if (type === "create") {
      await addDoc(collection(db, "results"), {
        ...formData,
        teacherId: user?.uid ?? "",
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
        assessmentName: formData.assessmentName,
        score: formData.score,
        maxScore: formData.maxScore,
        weight: formData.weight,
        date: formData.date,
      });
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new result" : "Edit result"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Student</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("studentId")}
            defaultValue={data?.studentId as string | undefined}
          >
            <option value="">Select a student</option>
            {studentsData.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.studentId?.message && (
            <p className="text-xs text-red-400">{errors.studentId.message.toString()}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Class</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("classId")}
            defaultValue={data?.classId as string | undefined}
          >
            <option value="">Select a class</option>
            {classesData.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.classId?.message && (
            <p className="text-xs text-red-400">{errors.classId.message.toString()}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("termId")}
            defaultValue={data?.termId as string | undefined}
          >
            <option value="">Select a term</option>
            {termsData.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
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
