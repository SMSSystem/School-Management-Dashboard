import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import InputField from "../InputField";
import { db, type SubjectDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const DAY_OPTIONS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
] as const;

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(100),
  description: z.string().max(500).optional(),
  classScope: z.enum(['institution', 'class']),
  classIds: z.array(z.string()),
  classNames: z.array(z.string()),
  teacherIds: z.array(z.string()),
  teacherNames: z.array(z.string()),
  cwWeight: z.coerce.number().min(0).max(100),
  examWeight: z.coerce.number().min(0).max(100),
  frequency: z.enum(['daily', 'weekly', 'fortnightly']),
  sessionDayOfWeek: z.array(z.number()),
  fortnightlyOffset: z.union([z.literal(0), z.literal(1)]).optional(),
}).superRefine((data, ctx) => {
  if (data.classScope === 'class' && data.classIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select at least one class.",
      path: ["classIds"],
    });
  }
  if (data.cwWeight + data.examWeight !== 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Course Work and Exam weights must sum to 100.",
      path: ["examWeight"],
    });
  }
  if (data.frequency === 'weekly' && data.sessionDayOfWeek.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select at least one day.",
      path: ["sessionDayOfWeek"],
    });
  }
  if (data.frequency === 'fortnightly' && data.sessionDayOfWeek.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select at least one day.",
      path: ["sessionDayOfWeek"],
    });
  }
});


const SubjectForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: Partial<SubjectDocument & { id: string }>;
  onClose?: () => void;
}) => {
  const { user, institutionId } = useAuth();

  const [liveClasses, setLiveClasses] = useState<{ id: string; name: string }[]>([]);
  const [liveTeachers, setLiveTeachers] = useState<{ id: string; name: string }[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedClassNames, setSelectedClassNames] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedTeacherNames, setSelectedTeacherNames] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [includeSaturday, setIncludeSaturday] = useState(false);
  const [fortnightlyOffset, setFortnightlyOffset] = useState<0 | 1>(0);
  const [enrollmentByClass, setEnrollmentByClass] = useState<
    Record<string, { type: 'all' | 'selective'; excludedIds: string[]; excludedNames: string[] }>
  >({});
  const [classStudents, setClassStudents] = useState<
    Record<string, { uid: string; name: string }[]>
  >({});

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      classScope: 'institution',
      classIds: [],
      classNames: [],
      teacherIds: [],
      teacherNames: [],
      cwWeight: 0,
      examWeight: 100,
      frequency: 'weekly',
      sessionDayOfWeek: [],
      fortnightlyOffset: 0,
    },
  });

  useEffect(() => {
    if (!institutionId) return;

    const unsubClasses = onSnapshot(
      query(collection(db, 'classes'), where('institutionId', '==', institutionId)),
      (snap) => setLiveClasses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    const unsubTeachers = onSnapshot(
      query(
        collection(db, 'users'),
        where('role', '==', 'regular_teacher'),
        where('institutionId', '==', institutionId),
      ),
      (snap) => setLiveTeachers(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    return () => {
      unsubClasses();
      unsubTeachers();
    };
  }, [institutionId]);

  useEffect(() => {
    if (type === 'update' && data) {
      const freq: 'daily' | 'weekly' | 'fortnightly' =
        data.frequency === 'daily' ? 'daily'
        : data.frequency === 'fortnightly' ? 'fortnightly'
        : 'weekly';
      const days = data.sessionDayOfWeek ?? [];
      reset({
        name: data.name ?? '',
        description: data.description ?? '',
        classScope: data.classScope ?? 'institution',
        classIds: data.classIds ?? [],
        classNames: data.classNames ?? [],
        teacherIds: data.teacherIds ?? [],
        teacherNames: data.teacherNames ?? [],
        cwWeight: data.cwWeight ?? 0,
        examWeight: data.examWeight ?? 0,
        frequency: freq,
        sessionDayOfWeek: days,
        fortnightlyOffset: data.fortnightlyOffset ?? 0,
      });
      setSelectedClassIds(data.classIds ?? []);
      setSelectedClassNames(data.classNames ?? []);
      setSelectedTeacherIds(data.teacherIds ?? []);
      setSelectedTeacherNames(data.teacherNames ?? []);
      if (freq === 'daily') {
        setIncludeSaturday(days.includes(6));
      } else if (freq === 'fortnightly') {
        setSelectedDays(days);
        setFortnightlyOffset(data.fortnightlyOffset ?? 0);
      } else {
        setSelectedDays(days);
      }
      if (data.id) {
        getDocs(
          query(collection(db, 'subjectEnrollments'), where('subjectId', '==', data.id))
        ).then((snap) => {
          const byClass: Record<string, { type: 'all' | 'selective'; excludedIds: string[]; excludedNames: string[] }> = {};
          snap.docs.forEach((d) => {
            const docData = d.data();
            byClass[docData.classId as string] = {
              type: docData.enrollmentType as 'all' | 'selective',
              excludedIds: (docData.excludedStudentIds as string[]) ?? [],
              excludedNames: (docData.excludedStudentNames as string[]) ?? [],
            };
          });
          setEnrollmentByClass(byClass);
        });
      }
    }
  }, [type, data, reset]);

  const classScope = watch('classScope');
  const frequency = watch('frequency');
  const cwWeight = watch('cwWeight') ?? 0;
  const examWeight = watch('examWeight') ?? 0;
  const weightSum = Number(cwWeight) + Number(examWeight);

  const { onChange: onCwChange, ...cwRest } = register('cwWeight');
  const { onChange: onExamChange, ...examRest } = register('examWeight');

  const handleScopeChange = (scope: 'institution' | 'class') => {
    setValue('classScope', scope);
    if (scope === 'institution') {
      setSelectedClassIds([]);
      setSelectedClassNames([]);
      setValue('classIds', []);
      setValue('classNames', []);
    }
  };

  const toggleClass = (id: string, name: string) => {
    const nextIds = selectedClassIds.includes(id)
      ? selectedClassIds.filter((x) => x !== id)
      : [...selectedClassIds, id];
    const nextNames = selectedClassNames.includes(name)
      ? selectedClassNames.filter((x) => x !== name)
      : [...selectedClassNames, name];
    setSelectedClassIds(nextIds);
    setSelectedClassNames(nextNames);
    setValue('classIds', nextIds);
    setValue('classNames', nextNames);
  };

  const toggleTeacher = (id: string, name: string) => {
    const nextIds = selectedTeacherIds.includes(id)
      ? selectedTeacherIds.filter((x) => x !== id)
      : [...selectedTeacherIds, id];
    const nextNames = selectedTeacherNames.includes(name)
      ? selectedTeacherNames.filter((x) => x !== name)
      : [...selectedTeacherNames, name];
    setSelectedTeacherIds(nextIds);
    setSelectedTeacherNames(nextNames);
    setValue('teacherIds', nextIds);
    setValue('teacherNames', nextNames);
  };

  const handleFrequencyChange = (f: 'daily' | 'weekly' | 'fortnightly') => {
    setValue('frequency', f);
    if (f === 'daily') {
      const days = includeSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
      setValue('sessionDayOfWeek', days);
    } else {
      // both 'weekly' and 'fortnightly' use the day checkbox UI
      setValue('sessionDayOfWeek', selectedDays);
    }
  };

  const handleIncludeSaturdayChange = (include: boolean) => {
    setIncludeSaturday(include);
    setValue('sessionDayOfWeek', include ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]);
  };

  const toggleDay = (day: number) => {
    const nextDays = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day].sort((a, b) => a - b);
    setSelectedDays(nextDays);
    setValue('sessionDayOfWeek', nextDays);
  };

  async function loadStudentsForClass(classId: string) {
    if (classStudents[classId]) return;
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('role', '==', 'student'),
        where('classId', '==', classId),
      )
    );
    setClassStudents((prev) => ({
      ...prev,
      [classId]: snap.docs
        .map((d) => ({ uid: d.id, name: d.data().name as string }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  async function writeEnrollments(subjectId: string, subjectName: string) {
    const classesToEnroll =
      classScope === 'class'
        ? selectedClassIds.map((id, i) => ({ id, name: selectedClassNames[i] }))
        : liveClasses;
    for (const cls of classesToEnroll) {
      const enrollment: { type: 'all' | 'selective'; excludedIds: string[]; excludedNames: string[] } =
        enrollmentByClass[cls.id] ?? { type: 'all', excludedIds: [], excludedNames: [] };
      await setDoc(doc(db, 'subjectEnrollments', `${subjectId}_${cls.id}`), {
        institutionId: institutionId ?? '',
        subjectId,
        subjectName,
        classId: cls.id,
        className: cls.name,
        enrollmentType: enrollment.type,
        excludedStudentIds: enrollment.excludedIds,
        excludedStudentNames: enrollment.excludedNames,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid ?? '',
      });
    }
  }

  const onSubmit = handleSubmit(async (formData) => {
    const payload = {
      name: formData.name,
      description: formData.description ?? "",
      institutionId: institutionId ?? "",
      classScope: formData.classScope,
      classIds: formData.classScope === 'institution' ? [] : formData.classIds,
      classNames: formData.classScope === 'institution' ? [] : formData.classNames,
      teacherIds: formData.teacherIds,
      teacherNames: formData.teacherNames,
      cwWeight: formData.cwWeight,
      examWeight: formData.examWeight,
      frequency: formData.frequency,
      sessionDayOfWeek: formData.sessionDayOfWeek,
      fortnightlyOffset: formData.frequency === 'fortnightly' ? fortnightlyOffset : undefined,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid ?? "",
    };

    if (type === "create") {
      const docRef = await addDoc(collection(db, "subjects"), {
        ...payload,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? "",
      });
      await writeEnrollments(docRef.id, formData.name);
    } else {
      const id = data?.id;
      if (typeof id !== "string") {
        console.log("SubjectForm update: no string ID (mock mode)", formData);
        return;
      }
      await updateDoc(doc(db, "subjects", id), payload);
      await writeEnrollments(id, formData.name);
    }
    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new subject" : "Edit subject"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">

        <InputField
          label="Subject Name"
          name="name"
          defaultValue={data?.name}
          register={register}
          error={errors.name}
        />

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Description</label>
          <textarea
            {...register("description")}
            defaultValue={data?.description}
            rows={3}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.description?.message && (
            <p className="text-xs text-red-400">{errors.description.message.toString()}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Class Scope</label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                value="institution"
                checked={classScope === 'institution'}
                onChange={() => handleScopeChange('institution')}
              />
              Entire Institution
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                value="class"
                checked={classScope === 'class'}
                onChange={() => handleScopeChange('class')}
              />
              Specific Class(es)
            </label>
          </div>
          {errors.classScope?.message && (
            <p className="text-xs text-red-400">{errors.classScope.message.toString()}</p>
          )}
        </div>

        {classScope === 'class' && (
          <div className="flex flex-col gap-2 w-full">
            <label className="text-xs text-gray-500 dark:text-gray-300">Classes</label>
            <div className="ring-[1.5px] ring-gray-300 rounded-md p-2 max-h-40 overflow-y-auto dark:ring-gray-600 dark:bg-gray-900">
              {liveClasses.length === 0 ? (
                <p className="text-xs text-gray-400">No classes found.</p>
              ) : (
                liveClasses.map((cls) => (
                  <label key={cls.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedClassIds.includes(cls.id)}
                      onChange={() => toggleClass(cls.id, cls.name)}
                    />
                    {cls.name}
                  </label>
                ))
              )}
            </div>
            {errors.classIds?.message && (
              <p className="text-xs text-red-400">{errors.classIds.message.toString()}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Teachers</label>
          <div className="ring-[1.5px] ring-gray-300 rounded-md p-2 max-h-40 overflow-y-auto dark:ring-gray-600 dark:bg-gray-900">
            {liveTeachers.length === 0 ? (
              <p className="text-xs text-gray-400">No teachers found.</p>
            ) : (
              liveTeachers.map((teacher) => (
                <label key={teacher.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTeacherIds.includes(teacher.id)}
                    onChange={() => toggleTeacher(teacher.id, teacher.name)}
                  />
                  {teacher.name}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Course Work Weight (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            {...cwRest}
            onChange={(e) => {
              onCwChange(e);
              const cw = Math.max(0, Math.min(100, Number(e.target.value)));
              if (!isNaN(cw)) setValue('examWeight', 100 - cw);
            }}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.cwWeight?.message && (
            <p className="text-xs text-red-400">{errors.cwWeight.message.toString()}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Exam Weight (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            {...examRest}
            onChange={(e) => {
              onExamChange(e);
              const exam = Math.max(0, Math.min(100, Number(e.target.value)));
              if (!isNaN(exam)) setValue('cwWeight', 100 - exam);
            }}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.examWeight?.message && (
            <p className="text-xs text-red-400">{errors.examWeight.message.toString()}</p>
          )}
        </div>

        <div className="w-full">
          <p className={`text-xs ${weightSum !== 100 ? 'text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            Total: {weightSum}% — must equal 100
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Attendance Frequency</label>
          <div className="flex gap-6">
            {(['daily', 'weekly', 'fortnightly'] as const).map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={frequency === f}
                  onChange={() => handleFrequencyChange(f)}
                />
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </label>
            ))}
          </div>

          {frequency === 'daily' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={includeSaturday}
                onChange={(e) => handleIncludeSaturdayChange(e.target.checked)}
              />
              Include Saturdays
            </label>
          )}

          {frequency === 'weekly' && (
            <div className="flex flex-wrap gap-4 mt-1">
              {DAY_OPTIONS.map(({ label, value }) => (
                <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDays.includes(value)}
                    onChange={() => toggleDay(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}

          {frequency === 'fortnightly' && (
            <>
              <div className="flex flex-wrap gap-4 mt-1">
                {DAY_OPTIONS.map(({ label, value }) => (
                  <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(value)}
                      onChange={() => toggleDay(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="flex gap-6 mt-2">
                {([0, 1] as const).map((offset) => (
                  <label key={offset} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={fortnightlyOffset === offset}
                      onChange={() => {
                        setFortnightlyOffset(offset);
                        setValue('fortnightlyOffset', offset);
                      }}
                    />
                    {offset === 0 ? 'Starts week 1 of term (odd weeks)' : 'Starts week 2 of term (even weeks)'}
                  </label>
                ))}
              </div>
            </>
          )}

          {errors.sessionDayOfWeek?.message && (
            <p className="text-xs text-red-400">{errors.sessionDayOfWeek.message.toString()}</p>
          )}
        </div>

        {frequency && (
          <div className="flex flex-col gap-2 w-full">
            <label className="text-xs text-gray-500 dark:text-gray-300">Student Enrollment</label>
            {(classScope === 'class' ? selectedClassIds : liveClasses.map((c) => c.id)).length === 0 ? (
              <p className="text-xs text-gray-400">
                {classScope === 'class' ? 'Select at least one class above.' : 'No classes found.'}
              </p>
            ) : (
              (classScope === 'class' ? selectedClassIds : liveClasses.map((c) => c.id)).map((classId) => {
                const cls = liveClasses.find((c) => c.id === classId);
                const enrollment = enrollmentByClass[classId] ?? { type: 'all' as const, excludedIds: [] as string[], excludedNames: [] as string[] };
                return (
                  <div key={classId} className="ring-[1.5px] ring-gray-300 dark:ring-gray-600 rounded-md p-3 flex flex-col gap-2">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{cls?.name ?? classId}</p>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enrollment.type === 'all'}
                        onChange={(e) => {
                          const nextType = e.target.checked ? 'all' : 'selective';
                          setEnrollmentByClass((prev) => ({
                            ...prev,
                            [classId]: { type: nextType, excludedIds: [], excludedNames: [] },
                          }));
                          if (nextType === 'selective') loadStudentsForClass(classId);
                        }}
                      />
                      All students enrolled
                    </label>
                    {enrollment.type === 'selective' && (
                      <div className="ml-4 max-h-32 overflow-y-auto flex flex-col gap-1">
                        {(classStudents[classId] ?? []).length === 0 ? (
                          <p className="text-xs text-gray-400">Loading students…</p>
                        ) : (
                          (classStudents[classId] ?? []).map((student) => {
                            const excluded = enrollment.excludedIds.includes(student.uid);
                            return (
                              <label key={student.uid} className="flex items-center gap-2 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!excluded}
                                  onChange={() => {
                                    setEnrollmentByClass((prev) => {
                                      const curr = prev[classId] ?? { type: 'selective' as const, excludedIds: [] as string[], excludedNames: [] as string[] };
                                      const nextExcludedIds = excluded
                                        ? curr.excludedIds.filter((id) => id !== student.uid)
                                        : [...curr.excludedIds, student.uid];
                                      const nextExcludedNames = excluded
                                        ? curr.excludedNames.filter((n) => n !== student.name)
                                        : [...curr.excludedNames, student.name];
                                      return {
                                        ...prev,
                                        [classId]: { ...curr, excludedIds: nextExcludedIds, excludedNames: nextExcludedNames },
                                      };
                                    });
                                  }}
                                />
                                {student.name}
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default SubjectForm;
