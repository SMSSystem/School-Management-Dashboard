import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc, collection, deleteField, getDocs, query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db, DISCIPLINARY_ACTION_LABELS, type DisciplinaryActionType } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc } from "@/lib/paths";

type DropdownItem = { id: string; name: string };
type StudentOption = { id: string; name: string; classId?: string };

const TYPES: DisciplinaryActionType[] = ['merit', 'demerit', 'detention', 'suspension'];
const NEEDS_DATE_RANGE = new Set<DisciplinaryActionType>(['detention', 'suspension']);

const schema = z.object({
  studentId: z.string().min(1, 'Student is required.'),
  classId: z.string().min(1, 'Class is required.'),
  termId: z.string().min(1, 'Term is required.'),
  type: z.enum(['merit', 'demerit', 'detention', 'suspension']),
  reason: z.string().min(1, 'Reason is required.').max(500, 'Reason must be 500 characters or less.'),
  date: z.string().min(1, 'Date is required.'),
  endDate: z.string().optional(),
  served: z.boolean().optional(),
});

type FormData = Partial<Record<string, string | number | boolean | readonly string[] | undefined>>;
const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LOCKED_CLS =
  "ring-[1.5px] ring-gray-200 p-2 rounded-md text-sm w-full bg-gray-100 text-gray-500 dark:ring-gray-700 dark:bg-gray-800 dark:text-gray-400";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";

const DisciplinaryActionForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId, displayName } = useAuth();

  const [terms, setTerms] = useState<DropdownItem[]>([]);
  const [classes, setClasses] = useState<DropdownItem[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  // Locked whenever this form was opened pre-scoped to a specific student —
  // either editing an existing entry, or created from the Student Detail
  // page's "+" button (which passes studentId/studentName up front).
  const studentLocked = type === 'update' || Boolean(data?.studentId);
  const [studentQuery, setStudentQuery] = useState(studentLocked ? String(data?.studentName ?? '') : '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      studentId: (data?.studentId as string | undefined) ?? '',
      classId: (data?.classId as string | undefined) ?? '',
      termId: (data?.termId as string | undefined) ?? '',
      type: (data?.type as DisciplinaryActionType | undefined) ?? 'merit',
      reason: (data?.reason as string | undefined) ?? '',
      date: (data?.date as string | undefined) ?? '',
      endDate: (data?.endDate as string | undefined) ?? '',
      served: (data?.served as boolean | undefined) ?? false,
    },
  });

  const watchedType = watch('type') as DisciplinaryActionType;
  const needsRange = NEEDS_DATE_RANGE.has(watchedType);

  useEffect(() => {
    if (!institutionId) return;
    getDocs(institutionCollection(institutionId, 'terms')).then((snap) =>
      setTerms(
        snap.docs
          .map((d) => ({ id: d.id, name: String(d.data().name ?? '') }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) return;
    getDocs(institutionCollection(institutionId, 'classes')).then((snap) =>
      setClasses(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' }))),
    );
  }, [institutionId]);

  // Any student in the institution can be targeted — not scoped to the
  // creating teacher's own subjects/classes (a teacher can discipline a
  // student they encounter, not just their own students). Skipped entirely
  // when the student is already locked in (pre-scoped from Student Detail).
  useEffect(() => {
    if (!institutionId || type !== 'create' || studentLocked) return;
    getDocs(query(
      collection(db, 'users'),
      where('institutionId', '==', institutionId),
      where('role', '==', 'student'),
    )).then((snap) =>
      setStudents(snap.docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) ?? '',
        classId: d.data().classId as string | undefined,
      }))),
    );
  }, [institutionId, type, studentLocked]);

  const filteredStudents = studentQuery.trim()
    ? students.filter((s) => s.name.toLowerCase().includes(studentQuery.trim().toLowerCase())).slice(0, 8)
    : [];

  const selectStudent = (s: StudentOption) => {
    setValue('studentId', s.id, { shouldValidate: true });
    setValue('classId', s.classId ?? '', { shouldValidate: true });
    setStudentQuery(s.name);
    setShowSuggestions(false);
  };

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    if (!institutionId || institutionId === '*') {
      setSubmitError('Failed to save disciplinary action.');
      return;
    }
    try {
      const term = terms.find((t) => t.id === formData.termId);

      if (type === 'create') {
        const student = students.find((s) => s.id === formData.studentId);
        const cls = classes.find((c) => c.id === formData.classId);
        await addDoc(institutionCollection(institutionId, 'disciplinaryActions'), {
          institutionId,
          studentId: formData.studentId,
          // students[] is never fetched when the student arrives pre-locked
          // (see the fetch-skip above) — fall back to the query text, which
          // was seeded from data.studentName in that case.
          studentName: student?.name ?? studentQuery,
          classId: formData.classId,
          className: cls?.name ?? '',
          termId: formData.termId,
          termName: term?.name ?? '',
          type: formData.type,
          reason: formData.reason,
          date: formData.date,
          ...(needsRange && formData.endDate && { endDate: formData.endDate }),
          ...(needsRange && { served: formData.served ?? false }),
          issuedBy: user?.uid ?? '',
          issuedByName: displayName ?? '',
          issuedByRole: role ?? '',
          createdAt: serverTimestamp(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== 'string') {
          console.log('DisciplinaryActionForm update: no string ID (mock mode)', formData);
          return;
        }
        // Student/term are locked on edit (see DISCIPLINARY_ACTION_SPEC.md) —
        // only the substantive fields are ever written on update.
        await updateDoc(institutionDoc(institutionId, 'disciplinaryActions', id), {
          type: formData.type,
          reason: formData.reason,
          date: formData.date,
          endDate: needsRange && formData.endDate ? formData.endDate : deleteField(),
          served: needsRange ? (formData.served ?? false) : deleteField(),
        });
      }
      onClose?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save disciplinary action.');
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Log a disciplinary action" : "Edit disciplinary action"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-2 w-full md:w-1/4 relative">
          <label className={LABEL_CLS}>Student</label>
          {studentLocked ? (
            <input value={studentQuery} disabled readOnly className={LOCKED_CLS} />
          ) : (
            <>
              <input
                type="text"
                className={SELECT_CLS}
                placeholder="Type a student's name…"
                value={studentQuery}
                autoComplete="off"
                onChange={(e) => {
                  setStudentQuery(e.target.value);
                  setValue('studentId', '', { shouldValidate: true });
                  setValue('classId', '');
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  blurTimeout.current = setTimeout(() => setShowSuggestions(false), 150);
                }}
              />
              {showSuggestions && filteredStudents.length > 0 && (
                <ul className="absolute top-full left-0 right-0 mt-1 z-10 max-h-48 overflow-y-auto ring-[1.5px] ring-gray-300 dark:ring-gray-600 bg-white dark:bg-gray-900 rounded-md shadow-lg">
                  {filteredStudents.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50 dark:hover:bg-gray-800 dark:text-gray-100"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (blurTimeout.current) clearTimeout(blurTimeout.current);
                          selectStudent(s);
                        }}
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {errors.studentId?.message && <p className="text-xs text-red-400">{errors.studentId.message}</p>}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Term</label>
          {type === 'update' ? (
            <input value={String(data?.termName ?? '')} disabled readOnly className={LOCKED_CLS} />
          ) : (
            <select className={SELECT_CLS} {...register('termId')}>
              <option value="">Select a term</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {errors.termId?.message && <p className="text-xs text-red-400">{errors.termId.message}</p>}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Type</label>
          <select className={SELECT_CLS} {...register('type')}>
            {TYPES.map((t) => <option key={t} value={t}>{DISCIPLINARY_ACTION_LABELS[t]}</option>)}
          </select>
          {errors.type?.message && <p className="text-xs text-red-400">{errors.type.message}</p>}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>{needsRange ? 'Start Date' : 'Date'}</label>
          <input type="date" className={SELECT_CLS} {...register('date')} />
          {errors.date?.message && <p className="text-xs text-red-400">{errors.date.message}</p>}
        </div>

        {needsRange && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className={LABEL_CLS}>End Date (optional)</label>
            <input type="date" className={SELECT_CLS} {...register('endDate')} />
            {errors.endDate?.message && <p className="text-xs text-red-400">{errors.endDate.message}</p>}
          </div>
        )}

        {needsRange && (
          <label className="flex items-center gap-2 text-sm w-full md:w-1/4 mt-6">
            <input type="checkbox" {...register('served')} className="w-4 h-4" />
            Served
          </label>
        )}

        <div className="flex flex-col gap-2 w-full">
          <label className={LABEL_CLS}>Reason</label>
          <textarea
            {...register('reason')}
            rows={4}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.reason?.message && <p className="text-xs text-red-400">{errors.reason.message}</p>}
        </div>
      </div>

      {submitError && <p className="text-xs text-red-400">{submitError}</p>}

      <button className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : type === "create" ? "Log entry" : "Update"}
      </button>
    </form>
  );
};

export default DisciplinaryActionForm;
