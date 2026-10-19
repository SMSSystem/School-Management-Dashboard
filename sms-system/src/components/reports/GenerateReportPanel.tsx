import type { GeneratePanelState } from "@/hooks/useGeneratePanelState";

type Option = { id: string; name: string };

const SELECT_CLS =
  "border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 flex-1";

const BTN_CANCEL =
  "px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm rounded-md transition-colors";

const BTN_GENERATE =
  "px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm rounded-md transition-colors disabled:opacity-50";

const modeButtonCls = (active: boolean) =>
  `px-3 py-1 text-sm rounded-md transition-colors ${
    active
      ? "bg-sky-500 text-white"
      : "bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
  }`;

type Props = {
  panel: GeneratePanelState;
  students: readonly Option[];
  terms: readonly Option[];
  classes: readonly Option[];
  onGenerate: () => void;
  onBatchGenerate: () => void;
};

// The admin's "generate" panel shared by the Report Cards and Progress Reports pages: one student
// and term, or a whole class and term, with the batch's progress and any message from the last run.
// The generating itself stays in each page, which passes its handlers in.
export default function GenerateReportPanel({
  panel,
  students,
  terms,
  classes,
  onGenerate,
  onBatchGenerate,
}: Props) {
  const {
    genMode,
    setGenMode,
    genStudentId,
    setGenStudentId,
    genTermId,
    setGenTermId,
    batchClassId,
    setBatchClassId,
    batchTermId,
    setBatchTermId,
    generating,
    batchProgress,
    panelError,
    panelWarnings,
    closePanel,
  } = panel;

  return (
    <div className="mt-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setGenMode("single")}
          className={modeButtonCls(genMode === "single")}
        >
          Single Student
        </button>
        <button
          onClick={() => setGenMode("batch")}
          className={modeButtonCls(genMode === "batch")}
        >
          Batch (Class)
        </button>
      </div>

      {genMode === "single" ? (
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={genStudentId}
            onChange={(e) => setGenStudentId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">Select student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={genTermId}
            onChange={(e) => setGenTermId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">Select term…</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={onGenerate}
            disabled={!genStudentId || !genTermId || generating}
            className={BTN_GENERATE}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
          <button onClick={closePanel} className={BTN_CANCEL}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={batchClassId}
              onChange={(e) => setBatchClassId(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={batchTermId}
              onChange={(e) => setBatchTermId(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">Select term…</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={onBatchGenerate}
              disabled={!batchClassId || !batchTermId || generating}
              className={BTN_GENERATE}
            >
              {generating ? "Generating…" : "Batch Generate"}
            </button>
            <button onClick={closePanel} className={BTN_CANCEL}>
              Cancel
            </button>
          </div>

          {batchProgress && (
            <div className="text-xs mt-1">
              <p className="text-gray-600 dark:text-gray-400">
                Progress: {batchProgress.done} / {batchProgress.total}
              </p>
              {batchProgress.errors.length > 0 && (
                <ul className="mt-1 text-red-500 list-disc list-inside">
                  {batchProgress.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
              {batchProgress.done === batchProgress.total && (
                <p className="text-green-600 dark:text-green-400 mt-1">
                  Done. {batchProgress.total - batchProgress.errors.length}{" "}
                  succeeded, {batchProgress.errors.length} failed.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {panelError && <p className="mt-2 text-xs text-red-500">{panelError}</p>}
      {panelWarnings.length > 0 && (
        <ul className="mt-2 text-xs text-amber-600 dark:text-amber-400 list-disc list-inside">
          {panelWarnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
