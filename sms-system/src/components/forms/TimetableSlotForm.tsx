import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc, collection, doc, getDocs, orderBy, query, updateDoc, where,
} from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE, subjectsData, teachersData, termsData } from "@/lib/data";

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
type DayKey = (typeof DAY_KEYS)[number];

const DAY_OPTIONS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
];

const schema = z.object({
  termId:    z.string().min(1, 'Term is required'),
  subjectId: z.string().min(1, 'Subject is required'),
  teacherId: z.string().min(1, 'Teacher is required'),
  days:      z.array(z.enum(DAY_KEYS)).min(1, 'Select at least one day'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format'),
  duration:  z.coerce
              .number()
              .min(15, 'Minimum duration is 15 minutes')
              .max(480, 'Maximum duration is 8 hours (480 minutes)'),
  room:      z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;
type DropdownItem = { id: string; name: string };

function formatDuration(minutes: number): string {
  if (!minutes || isNaN(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const TimetableSlotForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId, department } = useAuth();

  const [terms, setTerms]       = useState<DropdownItem[]>([]);
  const [subjects, setSubjects] = useState<DropdownItem[]>([]);
  const [teachers, setTeachers] = useState<DropdownItem[]>([]);
  const [selectedDays, setSelectedDays] = useState<DayKey[]>(() => {
    if (!Array.isArray(data?.days)) return [];
    return (data.days as string[]).filter((d): d is DayKey =>
      (DAY_KEYS as readonly string[]).includes(d)
    );
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({ resolver: zodResolver(schema) });

  // Keep react-hook-form in sync with the days checkbox state
  useEffect(() => {
    setValue('days', selectedDays, { shouldValidate: true });
  }, [selectedDays, setValue]);

  // Populate dropdowns from Firestore (live) or mock data (mock / blank)
  useEffect(() => {
    if (!institutionId) return;
    if (DATA_MODE === 'live') {
      getDocs(query(
        collection(db, 'terms'),
        where('institutionId', '==', institutionId),
        orderBy('startDate', 'desc'),
      )).then(snap =>
        setTerms(snap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? '') })))
      );
      getDocs(query(
        collection(db, 'subjects'),
        where('institutionId', '==', institutionId),
      )).then(snap =>
        setSubjects(snap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? '') })))
      );
      getDocs(
        role === 'senior_teacher' && department
          ? query(
              collection(db, 'teachers'),
              where('institutionId', '==', institutionId),
              where('departmentId', '==', department),
            )
          : query(
              collection(db, 'teachers'),
              where('institutionId', '==', institutionId),
            ),
      ).then(snap =>
        setTeachers(snap.docs.map(d => ({ id: d.id, name: String(d.data().name ?? '') })))
      );
    } else {
      setTerms(termsData.map(t => ({ id: String(t.id), name: t.name })));
      setSubjects(subjectsData.map(s => ({ id: String(s.id), name: s.name })));
      setTeachers(teachersData.map(t => ({ id: t.teacherId, name: t.name })));
    }
  }, [institutionId, role, department]);

  const durationValue = watch('duration');

  const toggleDay = (day: DayKey) =>
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    try {
      const termName    = terms.find(t => t.id === formData.termId)?.name    ?? '';
      const subjectName = subjects.find(s => s.id === formData.subjectId)?.name ?? '';
      const teacherName = teachers.find(t => t.id === formData.teacherId)?.name ?? '';

      if (type === 'create') {
        await addDoc(collection(db, 'timetable_slots'), {
          ...formData,
          termName,
          subjectName,
          teacherName,
          institutionId,
          createdBy:     user?.uid ?? '',
          createdByRole: role ?? '',
          createdAt:     new Date().toISOString(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== 'string') {
          console.log('TimetableSlotForm update: no string ID (mock mode)', formData);
          return;
        }
        await updateDoc(doc(db, 'timetable_slots', id), {
          termId: formData.termId,
          termName,
          subjectId: formData.subjectId,
          subjectName,
          teacherId: formData.teacherId,
          teacherName,
          days:      formData.days,
          startTime: formData.startTime,
          duration:  formData.duration,
          room:      formData.room,
        });
      }
      onClose?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save timetable slot.');
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === 'create' ? 'Add timetable slot' : 'Edit timetable slot'}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        {/* Term */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register('termId')}
            defaultValue={data?.termId as string | undefined}
          >
            <option value="">Select a term</option>
            {terms.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.termId?.message && (
            <p className="text-xs text-red-400">{errors.termId.message}</p>
          )}
        </div>

        {/* Subject */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Subject</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register('subjectId')}
            defaultValue={data?.subjectId as string | undefined}
          >
            <option value="">Select a subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.subjectId?.message && (
            <p className="text-xs text-red-400">{errors.subjectId.message}</p>
          )}
        </div>

        {/* Teacher */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Teacher</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register('teacherId')}
            defaultValue={data?.teacherId as string | undefined}
          >
            <option value="">Select a teacher</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.teacherId?.message && (
            <p className="text-xs text-red-400">{errors.teacherId.message}</p>
          )}
        </div>

        {/* Start Time */}
        <InputField
          label="Start Time"
          name="startTime"
          type="time"
          defaultValue={data?.startTime as string | undefined}
          register={register}
          error={errors.startTime}
        />

        {/* Duration */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Duration (minutes)</label>
          <input
            type="number"
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register('duration')}
            defaultValue={data?.duration as number | undefined}
            min={15}
            max={480}
          />
          {durationValue > 0 && !isNaN(durationValue) && (
            <p className="text-xs text-gray-400">= {formatDuration(durationValue)}</p>
          )}
          {errors.duration?.message && (
            <p className="text-xs text-red-400">{errors.duration.message}</p>
          )}
        </div>

        {/* Room (optional) */}
        <InputField
          label="Room (optional)"
          name="room"
          defaultValue={data?.room as string | undefined}
          register={register}
          error={errors.room}
        />

        {/* Days */}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500">Days</label>
          <div className="flex gap-4 flex-wrap">
            {DAY_OPTIONS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDays.includes(key)}
                  onChange={() => toggleDay(key)}
                  className="w-4 h-4"
                />
                {label}
              </label>
            ))}
          </div>
          {errors.days?.message && (
            <p className="text-xs text-red-400">{errors.days.message}</p>
          )}
        </div>
      </div>

      {submitError && (
        <p className="text-xs text-red-400">{submitError}</p>
      )}

      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Saving…' : type === 'create' ? 'Add Slot' : 'Update'}
      </button>
    </form>
  );
};

export default TimetableSlotForm;
