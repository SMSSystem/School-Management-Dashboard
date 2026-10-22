import { warningPrefix, type ImportWarning } from "@/lib/examImport";

// What the last import asked the teacher to check (EXAMS_FEATURE_SPEC.md §4.4 review screen), shown above the
// questions until it is dismissed. It lives in the builder, so the questions it talks about are right below it.
export default function ImportWarningsBanner({ warnings, onDismiss }: { warnings: readonly ImportWarning[]; onDismiss: () => void }) {
  if (warnings.length === 0) return null;
  return (
    <div role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">
          {warnings.length} thing{warnings.length === 1 ? "" : "s"} to check from the import:
        </p>
        <button type="button" onClick={onDismiss} className="text-xs underline">
          Dismiss
        </button>
      </div>
      <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-xs">
        {warnings.map((w, i) => (
          <li key={i}>
            {warningPrefix(w)}
            {w.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
