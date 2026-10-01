import { TriangleAlert } from "lucide-react";
import { useMyDepartment } from "@/hooks/useMyDepartment";
import { NO_DEPARTMENT_NOTICE } from "@/lib/departmentRequirement";

// Warn-only: shown to a teacher who has no department (in an institution that
// has departments). It never blocks saving — an admin fixes the account in the
// Teachers list. Used on the teacher dashboards and inside the lesson-note,
// assignment and exam forms. Renders nothing for everyone else.
const NoDepartmentNotice = ({ className = "" }: { className?: string }) => {
  const { missing } = useMyDepartment();
  if (!missing) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200 ${className}`}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{NO_DEPARTMENT_NOTICE}</span>
    </div>
  );
};

export default NoDepartmentNotice;
