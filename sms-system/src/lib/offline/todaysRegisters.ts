// Which subject registers the background prefetch reads today (prefetchRegisters.ts). No Firebase import, so node
// tests can import it.

import type { SubjectDocument } from "@/types/institution";

/**
 * Whether a subject may meet on a date, from its weekly days or custom dates. Holidays and the fortnightly
 * alternation are not checked: at worst one extra register is read.
 */
export function meetsOn(
  subject: Pick<
    SubjectDocument,
    "frequency" | "sessionDayOfWeek" | "customFrequencyDays"
  >,
  dateISO: string,
): boolean {
  if (subject.frequency === "custom")
    return (subject.customFrequencyDays ?? []).includes(dateISO);
  const day = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return (subject.sessionDayOfWeek ?? []).includes(day);
}

/** The (subject, class) pairs to read: today's sessions, of subjects taught to named classes. */
export function todaysSubjectClasses(
  subjects: (SubjectDocument & { id: string })[],
  dateISO: string,
) {
  return subjects
    .filter((s) => s.classScope === "class" && meetsOn(s, dateISO))
    .flatMap((s) =>
      s.classIds.map((classId) => ({ subjectId: s.id, classId })),
    );
}

export interface SeniorTeacherProfile {
  assignedClassId: string | null;
  assignedClassName: string | null;
}

/** The working copy of a senior teacher's homeroom, so the General register finds the class offline. */
export const homeroomCopyName = (uid: string) => `homeroom:${uid}`;

export function homeroomOf(
  data: Record<string, unknown> | undefined,
): SeniorTeacherProfile {
  return {
    assignedClassId:
      typeof data?.assignedClassId === "string" ? data.assignedClassId : null,
    assignedClassName:
      typeof data?.assignedClassName === "string"
        ? data.assignedClassName
        : null,
  };
}
