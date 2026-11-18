import type {
  UserDocument,
  DisciplinaryActionDocument,
  DisciplinaryActionType,
  ParentRelationship,
} from "@/lib/firebase";
import { classNameOf, type ClassRef } from "@/lib/classNames";
import { extraClassIds, type ClassMembership } from "@/lib/studentClasses";
import { formatPhoneForDisplay } from "@/lib/phone";

// The student detail page's rules that need no screen or database (scenes/(dashboard)/list/students/[id]):
// the row types its sections show, the information rows of the student card, the long date format, the label
// of a linked parent, and which academic year a term belongs to.

export type Student = UserDocument & { uid: string; email?: string };

export type Activity = { id: string; activityName: string };
export type Responsibility = {
  id: string;
  title: string;
  organisation: string | null;
};
export type DisciplinaryEntry = DisciplinaryActionDocument & { id: string };
export type ParentLink = {
  docId: string;
  parentId: string;
  relationship?: ParentRelationship;
};
export type ParentOption = { uid: string; name: string; email?: string };

export const DISCIPLINARY_BADGE_CLS: Record<DisciplinaryActionType, string> = {
  merit: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  demerit:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  detention:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  suspension: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

/** The academic year a term belongs to, or "" for a term that is not in the list. */
export function academicYearIdOf(
  terms: { id: string; academicYearId?: string }[],
  termId: string,
): string {
  return terms.find((t) => t.id === termId)?.academicYearId ?? "";
}

/** A date such as "2012-04-05" as "April 5, 2012" (read as local midnight, so the day never shifts). */
export function formatLongDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "Mother — Jane Doe", or just the name when no relationship was recorded; the id stands in for a missing parent. */
export function parentLinkLabel(
  relationship: ParentRelationship | undefined,
  parentName: string | undefined,
  parentId: string,
): string {
  return relationship
    ? `${relationship.charAt(0).toUpperCase()}${relationship.slice(1)} — ${parentName ?? parentId}`
    : (parentName ?? parentId);
}

/** The rows of the student card, in order; a row with no value shows a dash on screen. */
export function studentInfoRows(
  student: Student,
  classes: ClassRef[] | undefined,
): { label: string; value: string | null | undefined }[] {
  return [
    {
      label: "Class",
      value: student.classId
        ? classNameOf(classes, student.classId)
        : undefined,
    },
    // Further classes have their own section under this card (additionalClassRows below).
    { label: "House", value: student.houseName },
    { label: "Gender", value: student.gender },
    {
      label: "Date of Birth",
      value: student.dateOfBirth
        ? formatLongDate(student.dateOfBirth)
        : undefined,
    },
    { label: "Student ID", value: student.institutionStudentId },
    {
      label: "Status",
      value: student.status
        ? student.status.charAt(0).toUpperCase() + student.status.slice(1)
        : student.status,
    },
    { label: "Phone", value: formatPhoneForDisplay(student.phone) },
    { label: "Email", value: (student as Student & { email?: string }).email },
  ];
}

/**
 * The student's further classes (lib/studentClasses.ts), home class left out, for the Additional Classes
 * section: each class by name, with "All subjects" or how many subjects were chosen there. Empty when there
 * are none. Edited in the student's edit form or on the class page.
 */
export function additionalClassRows(
  student: Student,
  classes: ClassRef[] | undefined,
): { id: string; name: string; subjects: string }[] {
  const membership = student as ClassMembership;
  return extraClassIds(membership).map((id) => {
    const chosen = membership.classSubjects?.[id];
    const count = Array.isArray(chosen) ? chosen.length : 0;
    return {
      id,
      name: classNameOf(classes, id),
      subjects:
        count === 0
          ? "All subjects"
          : `${count} chosen subject${count === 1 ? "" : "s"}`,
    };
  });
}
