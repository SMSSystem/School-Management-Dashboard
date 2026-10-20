// Convert a standalone assignment to a gradebook column: pick the column; one-way and retroactive.
export function ConversionDialog({
  conversionColumnsLoading,
  conversionColumnId,
  setConversionColumnId,
  conversionColumns,
  conversionError,
  conversionLoading,
  setConversionOpen,
  handleConversionSubmit,
}: {
  conversionColumnsLoading: boolean;
  conversionColumnId: string;
  setConversionColumnId: (id: string) => void;
  conversionColumns: { id: string; label: string; maxScore: number; order: number }[];
  conversionError: string | null;
  conversionLoading: boolean;
  setConversionOpen: (open: boolean) => void;
  handleConversionSubmit: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Convert to Gradebook</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          This is one-way and applies retroactively: every student already graded on this
          assignment will have their result rescaled to the chosen column's max score and
          moved into that column. This can't be undone from here.
        </p>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-300">Gradebook column</label>
          <select
            value={conversionColumnId}
            onChange={(e) => setConversionColumnId(e.target.value)}
            disabled={conversionColumnsLoading}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">
              {conversionColumnsLoading
                ? "Loading columns…"
                : conversionColumns.length > 0
                  ? "Select a column"
                  : "No columns yet for this class/subject/term"}
            </option>
            {conversionColumns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.label} (out of {col.maxScore})
              </option>
            ))}
          </select>
        </div>

        {conversionError && <p className="text-xs text-red-400">{conversionError}</p>}

        <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
            onClick={() => setConversionOpen(false)}
            disabled={conversionLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={conversionLoading || !conversionColumnId}
            className="bg-blue-500 text-white py-2 px-4 rounded-md text-sm disabled:opacity-50"
            onClick={handleConversionSubmit}
          >
            {conversionLoading ? "Converting…" : "Convert"}
          </button>
        </div>
      </div>
    </div>
  );
}
