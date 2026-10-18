import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { type SubjectDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useTeachingStaff } from "@/hooks/useTeachingStaff";
import { useSubjectEnrollmentChoices } from "@/hooks/useSubjectEnrollmentChoices";
import { toggleTeacherLists } from "@/lib/subjectTeachers";
import {
  buildSubjectPayload,
  dailyDays,
  enrollmentClassesFor,
  formValuesFor,
  frequencyOf,
  schema,
  toggleClassLists,
  toggleDayList,
  type Frequency,
} from "@/lib/subjectFormLogic";
import { saveSubject } from "@/lib/subjectFormSave";
import SubjectBasicFields from "./subject/SubjectBasicFields";
import ClassScopeFields from "./subject/ClassScopeFields";
import TeacherFields from "./subject/TeacherFields";
import WeightFields from "./subject/WeightFields";
import FrequencyFields from "./subject/FrequencyFields";
import EnrollmentFields from "./subject/EnrollmentFields";

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

  const { data: liveClasses = [] } = useInstitutionClasses();
  // Senior teachers, regular teachers and institution admins (admins tagged "(Admin)").
  const { staff: teachingStaff } = useTeachingStaff();
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedClassNames, setSelectedClassNames] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedTeacherNames, setSelectedTeacherNames] = useState<string[]>([]);
  // Optional: one of the ticked teachers, or "" for none (lib/subjectTeachers.ts).
  const [assistantId, setAssistantId] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [includeSaturday, setIncludeSaturday] = useState(false);
  const [fortnightlyOffset, setFortnightlyOffset] = useState<0 | 1>(0);
  const { enrollmentByClass, setEnrollmentByClass, classStudents, loadStudentsForClass } =
    useSubjectEnrollmentChoices({ type, data, institutionId });

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
      cwWeight: 40,
      examWeight: 60,
      frequency: 'weekly',
      sessionDayOfWeek: [],
      fortnightlyOffset: 0,
    },
  });

  useEffect(() => {
    if (type === 'update' && data) {
      const freq = frequencyOf(data.frequency);
      const days = data.sessionDayOfWeek ?? [];
      reset(formValuesFor(data));
      setSelectedClassIds(data.classIds ?? []);
      setSelectedClassNames(data.classNames ?? []);
      setSelectedTeacherIds(data.teacherIds ?? []);
      setSelectedTeacherNames(data.teacherNames ?? []);
      setAssistantId(data.assistantTeacherId ?? "");
      if (freq === 'daily') {
        setIncludeSaturday(days.includes(6));
      } else if (freq === 'fortnightly') {
        setSelectedDays(days);
        setFortnightlyOffset(data.fortnightlyOffset ?? 0);
      } else {
        setSelectedDays(days);
      }
    }
  }, [type, data, reset]);

  const classScope = watch('classScope');
  const frequency = watch('frequency');
  const cwWeight = watch('cwWeight') ?? 0;
  const examWeight = watch('examWeight') ?? 0;
  const weightSum = Number(cwWeight) + Number(examWeight);

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
    const next = toggleClassLists(selectedClassIds, selectedClassNames, id, name);
    setSelectedClassIds(next.ids);
    setSelectedClassNames(next.names);
    setValue('classIds', next.ids);
    setValue('classNames', next.names);
  };

  const toggleTeacher = (id: string, name: string) => {
    const next = toggleTeacherLists(selectedTeacherIds, selectedTeacherNames, id, name);
    setSelectedTeacherIds(next.ids);
    setSelectedTeacherNames(next.names);
    setValue('teacherIds', next.ids);
    setValue('teacherNames', next.names);
    // Unticking the assistant leaves no assistant (the label is only valid on a ticked teacher).
    if (id === assistantId && !next.ids.includes(id)) setAssistantId("");
  };

  const handleFrequencyChange = (f: Frequency) => {
    setValue('frequency', f);
    if (f === 'daily') {
      setValue('sessionDayOfWeek', dailyDays(includeSaturday));
    } else {
      // both 'weekly' and 'fortnightly' use the day checkbox UI
      setValue('sessionDayOfWeek', selectedDays);
    }
  };

  const handleIncludeSaturdayChange = (include: boolean) => {
    setIncludeSaturday(include);
    setValue('sessionDayOfWeek', dailyDays(include));
  };

  const toggleDay = (day: number) => {
    const nextDays = toggleDayList(selectedDays, day);
    setSelectedDays(nextDays);
    setValue('sessionDayOfWeek', nextDays);
  };

  const handleOffsetChange = (offset: 0 | 1) => {
    setFortnightlyOffset(offset);
    setValue('fortnightlyOffset', offset);
  };

  const onSubmit = handleSubmit(async (formData) => {
    if (!institutionId) return;
    if (type === "update" && typeof data?.id !== "string") {
      console.log("SubjectForm update: no string ID (mock mode)", formData);
      return;
    }
    await saveSubject({
      type,
      institutionId,
      uid: user?.uid ?? "",
      subjectId: data?.id,
      formData,
      payload: buildSubjectPayload({ formData, institutionId, fortnightlyOffset }),
      assistantId,
      classesToEnroll: enrollmentClassesFor(classScope, selectedClassIds, selectedClassNames, liveClasses),
      enrollmentByClass,
    });
    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new subject" : "Edit subject"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">

        <SubjectBasicFields data={data} register={register} errors={errors} />

        <ClassScopeFields
          classScope={classScope}
          liveClasses={liveClasses}
          selectedClassIds={selectedClassIds}
          errors={errors}
          handleScopeChange={handleScopeChange}
          toggleClass={toggleClass}
        />

        <TeacherFields
          teachingStaff={teachingStaff}
          selectedTeacherIds={selectedTeacherIds}
          selectedTeacherNames={selectedTeacherNames}
          assistantId={assistantId}
          setAssistantId={setAssistantId}
          toggleTeacher={toggleTeacher}
        />

        <WeightFields register={register} setValue={setValue} errors={errors} weightSum={weightSum} />

        <FrequencyFields
          frequency={frequency}
          includeSaturday={includeSaturday}
          selectedDays={selectedDays}
          fortnightlyOffset={fortnightlyOffset}
          errors={errors}
          handleFrequencyChange={handleFrequencyChange}
          handleIncludeSaturdayChange={handleIncludeSaturdayChange}
          toggleDay={toggleDay}
          handleOffsetChange={handleOffsetChange}
        />

        <EnrollmentFields
          frequency={frequency}
          classScope={classScope}
          selectedClassIds={selectedClassIds}
          liveClasses={liveClasses}
          enrollmentByClass={enrollmentByClass}
          setEnrollmentByClass={setEnrollmentByClass}
          classStudents={classStudents}
          loadStudentsForClass={loadStudentsForClass}
        />

      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default SubjectForm;
