import { STATUS_BADGE_CLS, STATUS_LABEL } from "@/lib/assignmentDetailLogic";

// A submission's status as a coloured pill.
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE_CLS[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
