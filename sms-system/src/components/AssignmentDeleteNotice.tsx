import { useEffect, useState } from "react";
import { loadAssignmentDeletePreflight } from "@/lib/assignmentDelete";
import {
  assignmentDeleteWarning,
  type AssignmentDeleteCounts,
} from "@/lib/assignmentDeleteLogic";

// The extra line of the delete dialog for an assignment: how many students' submissions go with it, and that grades
// stay. Counted when the dialog opens (two aggregate reads), never cached. A failed count shows nothing; the delete
// itself still removes everything. Rendered by every delete dialog, and shows only for an assignment.
export default function AssignmentDeleteNotice({
  table,
  institutionId,
  assignmentId,
}: {
  table: string;
  institutionId: string | null;
  assignmentId: string;
}) {
  const enabled = table === "assignment" && !!institutionId;
  const [counts, setCounts] = useState<
    AssignmentDeleteCounts | "loading" | "failed"
  >("loading");
  useEffect(() => {
    if (!enabled || !institutionId) return;
    let cancelled = false;
    setCounts("loading");
    loadAssignmentDeletePreflight(institutionId, assignmentId).then(
      (c) => {
        if (!cancelled) setCounts(c);
      },
      () => {
        if (!cancelled) setCounts("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, institutionId, assignmentId]);

  if (!enabled || counts === "failed") return null;
  if (counts === "loading")
    return (
      <p className="text-center text-sm text-gray-500">
        Counting the students' submissions…
      </p>
    );
  return (
    <p className="text-center text-sm text-gray-700 dark:text-gray-300">
      {assignmentDeleteWarning(counts)}
    </p>
  );
}
