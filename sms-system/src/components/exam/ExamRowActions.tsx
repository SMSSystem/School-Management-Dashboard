import { Link } from "react-router-dom";
import { BarChart3, Eye, ListChecks } from "lucide-react";
import FormModal from "@/components/FormModal";
import type { FormRecord } from "@/components/formRegistry";
import { useAuth } from "@/lib/AuthContext";
import { canManageExam, canViewExamContent } from "@/lib/examAccess";
import { canDuplicate, duplicateDefaults } from "@/lib/examDuplicate";
import { canWrite } from "@/lib/roleCapabilities";

const LINK_CLS = "flex h-7 w-7 items-center justify-center rounded-full";
const LINK_STYLE = { backgroundColor: "var(--brand-button-bg, #0284c7)" };

type ExamRow = { id: string; online?: boolean; status?: string; teacherId?: string; departmentId?: string };

// The Exams list's buttons for an online exam (EXAMS_FEATURE_SPEC.md §4.7): open the builder (to view only for a
// spectator), preview as a student, and duplicate. Shown only to people the exam is open to; the rules are what
// really decide, this keeps the buttons to what will work.
export default function ExamRowActions({ exam }: { exam: ExamRow }) {
  const { user, role, departmentId } = useAuth();
  if (exam.online !== true) return null;
  const person = { uid: user?.uid, role, departmentId };
  if (!canViewExamContent(exam, person)) return null;
  const manage = canManageExam(exam, person);
  return (
    <>
      <Link
        to={`/dashboard/list/exams/${exam.id}/build`}
        className={LINK_CLS}
        style={LINK_STYLE}
        title={manage ? "Build questions" : "View questions"}
        aria-label={manage ? "Build questions" : "View questions"}
      >
        <ListChecks className="h-3.5 w-3.5 text-white" aria-hidden="true" />
      </Link>
      {exam.status !== undefined && exam.status !== "draft" && (
        <Link
          to={`/dashboard/list/exams/${exam.id}/results`}
          className={LINK_CLS}
          style={LINK_STYLE}
          title="Results"
          aria-label="Results"
        >
          <BarChart3 className="h-3.5 w-3.5 text-white" aria-hidden="true" />
        </Link>
      )}
      <Link
        to={`/dashboard/list/exams/${exam.id}/preview`}
        className={LINK_CLS}
        style={LINK_STYLE}
        title="Preview as student"
        aria-label="Preview as student"
      >
        <Eye className="h-3.5 w-3.5 text-white" aria-hidden="true" />
      </Link>
      {manage && canWrite(role) && canDuplicate(exam) && (
        <FormModal
          table="exam"
          type="create"
          data={duplicateDefaults(exam as unknown as Record<string, unknown> & { id: string }) as unknown as FormRecord}
          triggerIcon="copy"
          triggerLabel="Duplicate exam"
        />
      )}
    </>
  );
}
