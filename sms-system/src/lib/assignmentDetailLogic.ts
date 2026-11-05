import type {
  AssignmentDocument,
  RubricDocument,
  SubmissionDocument,
} from "@/types/assessment";
import { ASSIGNMENT_VALUE_TYPE_LABELS } from "@/types/assessment";
import type { Role } from "@/types/people";
import { hasStaffView } from "@/lib/roleCapabilities";
import { readClassSubjects, takesSubject } from "@/lib/studentClasses";

// The assignment detail page's rules that need no screen or database (scenes/(dashboard)/list/assignments/[id]):
// who may edit and who may see the roster, the row types and badge text, the assignment's type and due date as
// shown, the class roster, the values the Grade dialog starts with and its checks, and the gradebook columns
// the Convert dialog offers.

export type Assignment = AssignmentDocument & { id: string };
export type Rubric = RubricDocument & { id: string };
export type Submission = SubmissionDocument & { id: string };
export type RosterStudent = {
  uid: string;
  name: string;
  institutionStudentId?: string;
};

export const canEditAssignment = (role: string | null) =>
  role === "institution_admin" ||
  role === "super_admin" ||
  role === "regular_teacher" ||
  role === "senior_teacher";

// Who may SEE the class roster and every student's submission state: the editors
// above plus a spectator, which reads the same data but cannot edit, convert or
// grade (canEditAssignment stays the gate for those).
export const canViewRoster = (role: Role | null) => hasStaffView(role);

export const STATUS_BADGE_CLS: Record<string, string> = {
  submitted: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  late: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  graded:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

export const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  late: "Late",
  graded: "Graded",
};

/** The gradebook an assignment's linked column lives in: class, subject and term. */
export function assignmentGradebookId(assignment: {
  classId: string;
  subjectId: string;
  termId: string;
}): string {
  return `${assignment.classId}_${assignment.subjectId}_${assignment.termId}`;
}

/** The type badge's text: the type's label, "Other" or the typed label, and a dash for a legacy assignment with none. */
export function assignmentTypeLabel(
  assignment: Pick<Assignment, "type" | "otherTypeLabel">,
): string {
  return assignment.type
    ? assignment.type === "other"
      ? (assignment.otherTypeLabel ?? "Other")
      : ASSIGNMENT_VALUE_TYPE_LABELS[assignment.type]
    : "—"; // legacy assignment, predates the type field
}

/** The due date as "October 5, 2026", or a dash when there is none. */
export function formatDueDate(dueDate: string | undefined): string {
  return dueDate
    ? new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}

/** The students of the class who take the subject, by name, from the class's student documents. */
export function buildRoster(
  studentDocs: { id: string; data: Record<string, unknown> }[],
  classId: string,
  subjectId: string,
): RosterStudent[] {
  return studentDocs
    .filter((d) =>
      takesSubject(
        {
          classId: d.data.classId as string | null | undefined,
          classIds: d.data.classIds as string[] | undefined,
          classSubjects: readClassSubjects(d.data.classSubjects),
        },
        classId,
        subjectId,
      ),
    )
    .map((d) => ({
      uid: d.id,
      name: (d.data.name as string | undefined) ?? d.id,
      institutionStudentId: d.data.institutionStudentId as string | undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What the Grade dialog starts with: the saved grade and feedback if there are any; in gradebook mode the column's max score. */
export function gradingFormFor(
  submission: Pick<Submission, "grade" | "maxGrade" | "feedback"> | undefined,
  gradingMode: Assignment["gradingMode"] | undefined,
  gradebookColumnMaxScore: number | null,
): { score: string; maxScore: string; feedback: string } {
  return {
    score: submission?.grade !== undefined ? String(submission.grade) : "",
    maxScore:
      gradingMode === "gradebook"
        ? String(gradebookColumnMaxScore ?? "")
        : submission?.maxGrade !== undefined
          ? String(submission.maxGrade)
          : "",
    feedback: submission?.feedback ?? "",
  };
}

/** The Grade dialog's two checks: the message to show, or the numbers to save. */
export function validateGrade(
  scoreText: string,
  maxScoreText: string,
): { error: string } | { score: number; maxScore: number } {
  const score = Number(scoreText);
  const maxScore = Number(maxScoreText);
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return { error: "Enter a valid score and max score." };
  }
  if (score > maxScore) {
    return { error: "Score cannot exceed the max score." };
  }
  return { score, maxScore };
}

/** The gradebook's columns as the Convert dialog lists them: untitled and zero-score defaults, in column order. */
export function conversionColumnsOf(
  docs: { id: string; data: Record<string, unknown> }[],
): { id: string; label: string; maxScore: number; order: number }[] {
  return docs
    .map((d) => ({
      id: d.id,
      label: (d.data.label as string | undefined) ?? "Untitled column",
      maxScore: (d.data.maxScore as number | undefined) ?? 0,
      order: (d.data.order as number | undefined) ?? 0,
    }))
    .sort((a, b) => a.order - b.order);
}
