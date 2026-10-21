import type { ExamDeletePreflight } from "@/hooks/useExamDeletePreflight";
import { examDeleteBlockReason, examDeleteWarning } from "@/lib/examDeleteLogic";

// The extra lines of the delete dialog for an online exam: what goes with it, or why it cannot be deleted yet.
export default function ExamDeleteNotice({ preflight }: { preflight: ExamDeletePreflight }) {
  if (preflight.state === "idle") return null;
  if (preflight.state === "loading") return <p className="text-center text-sm text-gray-500">Counting what goes with this exam…</p>;
  if (preflight.state === "failed") return null;
  const blocked = examDeleteBlockReason(preflight.sitting);
  if (blocked) {
    return (
      <p role="alert" className="text-center text-sm text-red-600 dark:text-red-400">
        {blocked}
      </p>
    );
  }
  return <p className="text-center text-sm text-gray-700 dark:text-gray-300">{examDeleteWarning(preflight.counts)}</p>;
}
