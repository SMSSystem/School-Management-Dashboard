import type { AmbiguousEntry } from "@/lib/spreadsheetImport";
import { decisionKey, type Decision } from "@/lib/importConfig";
import { SELECT_CLS, BTN_CLS, CANCEL_BTN_CLS } from "./importStyles";

// The resolve step: each value that matched no record, or more than one, is matched by hand or its rows skipped.
export function ResolveStep({
  resetAll,
  needsResolution,
  decisions,
  setDecisions,
  candidatesByColumn,
  resolveError,
  busy,
  applyResolutionsAndContinue,
}: {
  resetAll: () => void;
  needsResolution: AmbiguousEntry[];
  decisions: Map<string, Decision>;
  setDecisions: (next: Map<string, Decision>) => void;
  candidatesByColumn: Record<string, { id: string; name: string }[]>;
  resolveError: string | null;
  busy: boolean;
  applyResolutionsAndContinue: () => Promise<void>;
}) {
  return (
    <div>
      <button type="button" className="text-sm text-sky-600 dark:text-sky-400 underline mb-3" onClick={resetAll}>
        &larr; Change target
      </button>
      <p className="text-base mb-3">
        {needsResolution.length} value(s) in this file couldn't be matched to exactly one existing record.
        Resolve each one below, or choose to skip the affected row(s).
      </p>
      {needsResolution.map((entry) => {
        const key = decisionKey(entry.column, entry.value);
        const decision = decisions.get(key);
        const options =
          entry.matches.length > 0
            ? entry.matches
            : (candidatesByColumn[entry.column] ?? []).map((c) => ({ id: c.id, label: c.name }));
        return (
          <div key={key} className="border-b border-gray-100 dark:border-gray-700 py-3">
            <p className="text-base">
              <span className="font-medium">{entry.column}</span>: &quot;{entry.value}&quot; —{" "}
              {entry.matches.length === 0 ? "no match found" : `${entry.matches.length} possible matches`}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <select
                className={`${SELECT_CLS} max-w-xs`}
                value={decision && "selectedId" in decision ? decision.selectedId : ""}
                onChange={(e) => {
                  const next = new Map(decisions);
                  if (e.target.value) next.set(key, { selectedId: e.target.value });
                  else next.delete(key);
                  setDecisions(next);
                }}
              >
                <option value="">Select the correct {entry.column.toLowerCase()}…</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={Boolean(decision && "skip" in decision)}
                  onChange={(e) => {
                    const next = new Map(decisions);
                    if (e.target.checked) next.set(key, { skip: true });
                    else next.delete(key);
                    setDecisions(next);
                  }}
                />
                Skip row(s) with this value
              </label>
            </div>
          </div>
        );
      })}
      {resolveError && <p className="text-sm text-red-500 mt-2">{resolveError}</p>}
      <div className="flex items-center gap-3 mt-4">
        <button type="button" className={CANCEL_BTN_CLS} onClick={resetAll}>
          Cancel Import
        </button>
        <button type="button" className={BTN_CLS} disabled={busy} onClick={() => void applyResolutionsAndContinue()}>
          {busy ? "Checking…" : "Apply & Continue"}
        </button>
      </div>
    </div>
  );
}
