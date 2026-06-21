import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import InputField from "../InputField";
import { db, DayKey, DaySchedule, TimetableSlotDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const DAY_OPTIONS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
];

const THEORY_SUBTYPES = ['Lecture', 'Seminar', 'Discussion', 'Revision'] as const;
const PRACTICAL_SUBTYPES = ['Lab', 'Field', 'Workshop', 'Demonstration', 'Simulation'] as const;

const schema = z.object({
  termId:       z.string().min(1, 'Term is required'),
  subjectId:    z.string().min(1, 'Subject is required'),
  teacherId:    z.string().min(1, 'Teacher is required'),
  classId:      z.string().min(1, 'Class is required'),
  lessonType:   z.enum(['theory', 'practical']).optional(),
  lessonSubtype: z.string().optional(),
  room:         z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

interface SubjectRow { id: string; name: string; classIds: string[]; classNames: string[]; frequency?: string }
interface ClassRow { id: string; name: string }
interface TermRow { id: string; name: string }
interface TeacherRow { id: string; name: string }

function formatDuration(minutes: number): string {
  if (!minutes || isNaN(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function timeToMinutes(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const LessonForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId, department } = useAuth();

  const [subjects, setSubjects]   = useState<SubjectRow[]>([]);
  const [allClasses, setAllClasses] = useState<ClassRow[]>([]);
  const [terms, setTerms]         = useState<TermRow[]>([]);
  const [teachers, setTeachers]   = useState<TeacherRow[]>([]);

  // Schedule state managed outside react-hook-form due to dynamic structure
  const existingData = data as Record<string, unknown>;
  const existingSchedule = existingData?.schedule as Partial<Record<DayKey, DaySchedule>> | undefined;
  const initSchedule: Partial<Record<DayKey, DaySchedule>> = existingSchedule ??
    Object.fromEntries(
      ((existingData?.days as string[]) ?? []).map((day) => [
        day,
        { startTime: (existingData?.startTime as string) ?? '', duration: (existingData?.duration as number) ?? 60 },
      ]),
    );

  const [selectedDays, setSelectedDays] = useState<DayKey[]>(() => Object.keys(initSchedule) as DayKey[]);
  const [scheduleMap, setScheduleMap] = useState<Partial<Record<DayKey, DaySchedule>>>(() => initSchedule);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const awaitingConflictConfirm = useRef(false);

  // Subjects
  useEffect(() => {
    if (!institutionId) return;
    return onSnapshot(
      query(collection(db, 'subjects'), where('institutionId', '==', institutionId)),
      (snap) =>
        setSubjects(
          snap.docs
            .map((d) => ({
              id: d.id,
              name: d.data().name as string,
              classIds: (d.data().classIds as string[]) ?? [],
              classNames: (d.data().classNames as string[]) ?? [],
              frequency: d.data().frequency as string | undefined,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
    );
  }, [institutionId]);

  // Classes
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

  // Terms
  useEffect(() => {
    if (!institutionId) return;
    getDocs(
      query(collection(db, 'terms'), where('institutionId', '==', institutionId), orderBy('startDate', 'desc')),
    ).then((snap) =>
      setTerms(snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? '') }))),
    );
  }, [institutionId]);

  // Teachers — query all users in institution, filter by role client-side (avoids composite index)
  useEffect(() => {
    if (!institutionId) return;
    return onSnapshot(
      query(collection(db, 'users'), where('institutionId', '==', institutionId)),
      (snap) => {
        let list = snap.docs
          .filter((d) => d.data().role === 'senior_teacher' || d.data().role === 'regular_teacher')
          .map((d) => ({
            id: d.id,
            name: (d.data().name as string) ?? '',
            dept: d.data().department as string | undefined,
          }));
        if (role === 'senior_teacher' && department) {
          list = list.filter((t) => t.dept === department);
        }
        setTeachers(list.sort((a, b) => a.name.localeCompare(b.name)));
      },
    );
  }, [institutionId, role, department]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      termId:       (data?.termId as string) ?? '',
      subjectId:    (data?.subjectId as string) ?? '',
      teacherId:    (data?.teacherId as string) ?? '',
      classId:      (data?.classId as string) ?? '',
      lessonType:   (data?.lessonType as 'theory' | 'practical' | undefined) ?? undefined,
      lessonSubtype: (data?.lessonSubtype as string) ?? '',
      room:         (data?.room as string) ?? '',
    },
  });

  const subjectId   = watch('subjectId');
  const lessonType  = watch('lessonType');

  // Auto-populate class from subject (create only)
  useEffect(() => {
    if (type !== 'create' || !subjectId) return;
    const subject = subjects.find((s) => s.id === subjectId);
    if (!subject) return;
    if (subject.classIds.length === 1) setValue('classId', subject.classIds[0]);
    else if (subject.classIds.length > 1) setValue('classId', '');
  }, [subjectId, subjects, setValue, type]);

  // Reset subtype when lesson type changes
  useEffect(() => {
    setValue('lessonSubtype', '');
  }, [lessonType, setValue]);

  // Reset conflict state when schedule-affecting fields change
  useEffect(() => {
    setConflictWarning(null);
    awaitingConflictConfirm.current = false;
  }, [selectedDays, scheduleMap]);

  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const availableClasses: ClassRow[] =
    selectedSubject && selectedSubject.classIds.length > 0
      ? selectedSubject.classIds.map((id, i) => ({ id, name: selectedSubject.classNames[i] ?? id }))
      : allClasses;

  const subtypes = lessonType === 'theory' ? THEORY_SUBTYPES : lessonType === 'practical' ? PRACTICAL_SUBTYPES : [];

  // --- Schedule helpers ---

  const toggleDay = (day: DayKey) => {
    if (selectedDays.includes(day)) {
      setSelectedDays((prev) => prev.filter((d) => d !== day));
      setScheduleMap((prev) => {
        const next = { ...prev };
        delete next[day];
        return next;
      });
    } else {
      setSelectedDays((prev) => [...prev, day]);
      const lastDay = selectedDays[selectedDays.length - 1];
      const defaults: DaySchedule =
        lastDay && scheduleMap[lastDay] ? { ...scheduleMap[lastDay]! } : { startTime: '', duration: 60 };
      setScheduleMap((prev) => ({ ...prev, [day]: defaults }));
    }
  };

  const updateScheduleField = (day: DayKey, field: 'startTime' | 'duration', value: string) => {
    setScheduleMap((prev) => ({
      ...prev,
      [day]: { ...prev[day]!, [field]: field === 'duration' ? (parseInt(value) || 0) : value },
    }));
  };

  const copyFirstToAll = () => {
    if (selectedDays.length === 0) return;
    const source = scheduleMap[selectedDays[0]];
    if (!source) return;
    const next: Partial<Record<DayKey, DaySchedule>> = {};
    for (const day of selectedDays) next[day] = { ...source };
    setScheduleMap(next);
  };

  // --- Submit ---

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    setScheduleError(null);

    // Validate schedule
    if (selectedDays.length === 0) {
      setScheduleError('Select at least one day.');
      return;
    }
    for (const day of selectedDays) {
      const entry = scheduleMap[day];
      if (!entry || !entry.startTime || !/^\d{2}:\d{2}$/.test(entry.startTime)) {
        setScheduleError(`Enter a valid start time for ${DAY_OPTIONS.find((o) => o.key === day)?.label ?? day}.`);
        return;
      }
      if (!entry.duration || entry.duration < 15 || entry.duration > 480) {
        setScheduleError(`Duration must be 15–480 minutes for ${DAY_OPTIONS.find((o) => o.key === day)?.label ?? day}.`);
        return;
      }
    }

    // Conflict detection (two-click confirm pattern)
    if (!awaitingConflictConfirm.current) {
      const snap = await getDocs(
        query(
          collection(db, 'timetable_slots'),
          where('institutionId', '==', institutionId),
          where('termId', '==', formData.termId),
        ),
      );
      const editId = type === 'update' ? String(data?.id ?? '') : '';
      const conflict = snap.docs.find((d) => {
        if (d.id === editId) return false;
        const s = d.data() as TimetableSlotDocument;
        if (s.teacherId !== formData.teacherId) return false;
        const existingSchedule: Partial<Record<DayKey, DaySchedule>> = s.schedule ??
          Object.fromEntries(
            (s.days ?? []).map((day) => [day, { startTime: s.startTime ?? '', duration: s.duration ?? 0 }]),
          );
        for (const day of selectedDays) {
          const existing = existingSchedule[day];
          if (!existing) continue;
          const newStart = timeToMinutes(scheduleMap[day]!.startTime);
          const newEnd   = newStart + scheduleMap[day]!.duration;
          const sStart   = timeToMinutes(existing.startTime);
          const sEnd     = sStart + existing.duration;
          if (newStart < sEnd && newEnd > sStart) return true;
        }
        return false;
      });
      if (conflict) {
        const s = conflict.data() as TimetableSlotDocument;
        const existingSchedule: Partial<Record<DayKey, DaySchedule>> = s.schedule ??
          Object.fromEntries(
            (s.days ?? []).map((day) => [day, { startTime: s.startTime ?? '', duration: s.duration ?? 0 }]),
          );
        const conflictDays = selectedDays
          .filter((d) => d in existingSchedule)
          .map((d) => DAY_OPTIONS.find((o) => o.key === d)?.label ?? d)
          .join(', ');
        setConflictWarning(
          `Teacher already has "${s.subjectName}" on ${conflictDays}. Submit again to save anyway.`,
        );
        awaitingConflictConfirm.current = true;
        return;
      }
    }

    setConflictWarning(null);
    awaitingConflictConfirm.current = false;

    // Build final schedule object
    const schedule: Partial<Record<DayKey, DaySchedule>> = {};
    for (const day of selectedDays) schedule[day] = scheduleMap[day]!;

    const term    = terms.find((t) => t.id === formData.termId);
    const subject = subjects.find((s) => s.id === formData.subjectId);
    const teacher = teachers.find((t) => t.id === formData.teacherId);
    const cls     = availableClasses.find((c) => c.id === formData.classId);

    const payload = {
      institutionId,
      termId:       formData.termId,
      termName:     term?.name ?? '',
      subjectId:    formData.subjectId,
      subjectName:  subject?.name ?? '',
      teacherId:    formData.teacherId,
      teacherName:  teacher?.name ?? '',
      classId:      formData.classId,
      className:    cls?.name ?? '',
      frequency:    subject?.frequency ?? null,
      lessonType:   formData.lessonType ?? null,
      lessonSubtype: formData.lessonSubtype || null,
      schedule,
      room:         formData.room || null,
      createdBy:    user?.uid ?? '',
      createdByRole: role ?? '',
    };

    try {
      if (type === 'create') {
        await addDoc(collection(db, 'timetable_slots'), { ...payload, createdAt: serverTimestamp() });
      } else {
        const id = data?.id;
        if (typeof id !== 'string') return;
        await updateDoc(doc(db, 'timetable_slots', id), payload);
      }
      onClose?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save lesson.');
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === 'create' ? 'Add lesson' : 'Edit lesson'}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">

        {/* Term */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register('termId')}
          >
            <option value="">Select a term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.termId && <p className="text-xs text-red-400">{errors.termId.message}</p>}
        </div>

        {/* Subject */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Subject</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register('subjectId')}
          >
            <option value="">Select a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.subjectId && <p className="text-xs text-red-400">{errors.subjectId.message}</p>}
          {selectedSubject?.frequency && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Frequency: {selectedSubject.frequency} — inherited from subject. Edit the subject to change this.
            </p>
          )}
        </div>

        {/* Teacher */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Teacher</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register('teacherId')}
          >
            <option value="">Select a teacher</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.teacherId && <p className="text-xs text-red-400">{errors.teacherId.message}</p>}
        </div>

        {/* Class */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Class</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register('classId')}
          >
            <option value="">Select a class</option>
            {availableClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.classId && <p className="text-xs text-red-400">{errors.classId.message}</p>}
        </div>

        {/* Lesson Type */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Lesson Type (optional)</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register('lessonType')}
          >
            <option value="">— None —</option>
            <option value="theory">Theory</option>
            <option value="practical">Practical</option>
          </select>
        </div>

        {/* Lesson Subtype */}
        {subtypes.length > 0 && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500 dark:text-gray-300">Subtype (optional)</label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              {...register('lessonSubtype')}
            >
              <option value="">— None —</option>
              {subtypes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {/* Room */}
        <InputField
          label="Room (optional)"
          name="room"
          defaultValue={data?.room as string | undefined}
          register={register}
          error={errors.room}
        />

        {/* Days */}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Days</label>
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
          {scheduleError && <p className="text-xs text-red-400">{scheduleError}</p>}
        </div>

        {/* Per-day time inputs */}
        {selectedDays.length > 0 && (
          <div className="flex flex-col gap-4 w-full">
            {selectedDays.length > 1 && (
              <button
                type="button"
                className="text-xs text-blue-500 underline self-start"
                onClick={copyFirstToAll}
              >
                Copy {DAY_OPTIONS.find((o) => o.key === selectedDays[0])?.label} times to all days
              </button>
            )}
            {selectedDays.map((day) => {
              const entry = scheduleMap[day] ?? { startTime: '', duration: 60 };
              return (
                <div key={day} className="flex flex-wrap items-end gap-4">
                  <span className="text-sm font-medium w-8 mb-2">
                    {DAY_OPTIONS.find((o) => o.key === day)?.label}
                  </span>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Start Time</label>
                    <input
                      type="time"
                      className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      value={entry.startTime}
                      onChange={(e) => updateScheduleField(day, 'startTime', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Duration (min)</label>
                    <input
                      type="number"
                      className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-24 dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
                      value={entry.duration || ''}
                      min={15}
                      max={480}
                      onChange={(e) => updateScheduleField(day, 'duration', e.target.value)}
                    />
                  </div>
                  {entry.duration > 0 && !isNaN(entry.duration) && (
                    <span className="text-xs text-gray-400 mb-2">= {formatDuration(entry.duration)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {conflictWarning && (
        <p className="text-xs text-amber-500">{conflictWarning}</p>
      )}
      {submitError && (
        <p className="text-xs text-red-400">{submitError}</p>
      )}

      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Saving…' : type === 'create' ? 'Add Lesson' : 'Update'}
      </button>
    </form>
  );
};

export default LessonForm;
