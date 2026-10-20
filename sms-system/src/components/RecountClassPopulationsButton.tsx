import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/lib/ToastContext";
import { onLoadError } from "@/lib/reportError";
import { recountClassPopulations } from "@/lib/classPopulationQueries";
import { invalidateUserCounts } from "@/lib/invalidateUserCounts";

// Admin only. Counts the active students of every class again and stores the result on the class documents, which is
// where the Classes list reads its Population column from (lib/classPopulationDelta.ts). The app keeps the numbers
// current whenever a student is added, edited, moved, deactivated or deleted, so this is for the first count of a
// school and for repairing the numbers after students were changed outside the app (a seed or an import by script).
// It reads six counts per class once.
const RecountClassPopulationsButton = ({ classIds }: { classIds: string[] }) => {
  const { institutionId } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!institutionId || institutionId === "*" || classIds.length === 0) return null;

  const recount = async () => {
    setBusy(true);
    try {
      const n = await recountClassPopulations(institutionId, classIds);
      invalidateUserCounts(institutionId);
      showToast({ message: `Recounted the students of ${n} ${n === 1 ? "class" : "classes"}.`, variant: "success" });
    } catch (err) {
      onLoadError("the student counts")(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={recount}
      disabled={busy}
      title="Count the active students of every class again. The counts stay current on their own; use this after students were changed outside the app."
      className="flex items-center gap-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
    >
      <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
      {busy ? "Recounting…" : "Recount students"}
    </button>
  );
};

export default RecountClassPopulationsButton;
