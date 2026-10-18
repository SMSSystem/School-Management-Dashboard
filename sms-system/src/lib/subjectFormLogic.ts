import { z } from "zod";
import type { SubjectDocument } from "@/lib/firebase";
import { WEEKDAY_OPTIONS } from "@/lib/subjectFrequency";

// The subject form's rules that need no screen or database (components/forms/SubjectForm): the form's
// validation, the values it starts with when editing, how the day and class lists are ticked and unticked, the
// per-class student enrolment choices, which classes get an enrolment, and the document a save writes.

// Sundays excluded — not a valid session day for this form.
export const DAY_OPTIONS = WEEKDAY_OPTIONS.filter((d) => d.value !== 0);

export const schema = z.object({
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

/** What the form's fields hold, and what they hold once validated. */
export type SubjectFormValues = z.input<typeof schema>;
export type SubjectFormOutput = z.output<typeof schema>;

/** The subject being edited, as the list hands it over. */
export type SubjectFormRecord = Partial<SubjectDocument & { id: string }>;

export type Frequency = 'daily' | 'weekly' | 'fortnightly';

/** One class's student enrolment: everyone, or everyone except the students listed. */
export type EnrollmentChoice = { type: 'all' | 'selective'; excludedIds: string[]; excludedNames: string[] };
export type EnrollmentsByClass = Record<string, EnrollmentChoice>;

/** A class with no choice made yet enrols everyone. */
export const ALL_STUDENTS: EnrollmentChoice = { type: 'all', excludedIds: [], excludedNames: [] };

/** A stored frequency as the form knows it: anything but daily and fortnightly is weekly. */
export function frequencyOf(stored: string | undefined): Frequency {
  return stored === 'daily' ? 'daily' : stored === 'fortnightly' ? 'fortnightly' : 'weekly';
}

/** The values the form is reset to when editing a subject. */
export function formValuesFor(data: SubjectFormRecord): SubjectFormValues {
  return {
    name: data.name ?? '',
    description: data.description ?? '',
    classScope: data.classScope ?? 'institution',
    classIds: data.classIds ?? [],
    classNames: data.classNames ?? [],
    teacherIds: data.teacherIds ?? [],
    teacherNames: data.teacherNames ?? [],
    cwWeight: data.cwWeight ?? 0,
    examWeight: data.examWeight ?? 0,
    frequency: frequencyOf(data.frequency),
    sessionDayOfWeek: data.sessionDayOfWeek ?? [],
    fortnightlyOffset: data.fortnightlyOffset ?? 0,
  };
}

/** The session days of a daily subject: Monday to Friday, and Saturday when it is included. */
export function dailyDays(includeSaturday: boolean): number[] {
  return includeSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
}

/** Ticks or unticks one weekday, keeping the days in week order. */
export function toggleDayList(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

/** Ticks or unticks one class in both lists, which are matched by position, not by id. */
export function toggleClassLists(
  ids: string[],
  names: string[],
  id: string,
  name: string,
): { ids: string[]; names: string[] } {
  return {
    ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    names: names.includes(name) ? names.filter((x) => x !== name) : [...names, name],
  };
}

/** The per-class enrolment choices stored on a subject, from the documents read. */
export function enrollmentsByClass(
  docs: { classId?: unknown; enrollmentType?: unknown; excludedStudentIds?: unknown; excludedStudentNames?: unknown }[],
): EnrollmentsByClass {
  const byClass: EnrollmentsByClass = {};
  docs.forEach((docData) => {
    byClass[docData.classId as string] = {
      type: docData.enrollmentType as 'all' | 'selective',
      excludedIds: (docData.excludedStudentIds as string[]) ?? [],
      excludedNames: (docData.excludedStudentNames as string[]) ?? [],
    };
  });
  return byClass;
}

/** Switches one class between "all students" and "selective"; either way the exclusions start empty. */
export function setEnrollmentType(
  prev: EnrollmentsByClass,
  classId: string,
  nextType: 'all' | 'selective',
): EnrollmentsByClass {
  return { ...prev, [classId]: { type: nextType, excludedIds: [], excludedNames: [] } };
}

/** Excludes a student from a class's enrolment, or includes them again when `excluded` says they are out. */
export function toggleExcludedStudent(
  prev: EnrollmentsByClass,
  classId: string,
  student: { uid: string; name: string },
  excluded: boolean,
): EnrollmentsByClass {
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
}

/** The classes a save writes an enrolment for: the ticked ones, or every class for an institution-wide subject. */
export function enrollmentClassesFor<C extends { id: string; name: string }>(
  classScope: 'institution' | 'class',
  selectedClassIds: string[],
  selectedClassNames: string[],
  liveClasses: C[],
): { id: string; name: string }[] {
  return classScope === 'class'
    ? selectedClassIds.map((id, i) => ({ id, name: selectedClassNames[i] }))
    : liveClasses;
}

/** The document a save writes (without `updatedAt` and `updatedBy`, and the assistant and create-only fields, which the save adds). */
export function buildSubjectPayload({
  formData,
  institutionId,
  fortnightlyOffset,
}: {
  formData: SubjectFormOutput;
  institutionId: string;
  fortnightlyOffset: 0 | 1;
}) {
  return {
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
  };
}
