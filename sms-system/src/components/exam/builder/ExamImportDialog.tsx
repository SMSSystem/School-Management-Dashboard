import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import ExportMenu from "@/components/ExportMenu";
import { EXAM_IMPORT_HEADERS, warningPrefix, type ImportResult } from "@/lib/examImport";
import type { ExamAnswerMode } from "@/types/exams";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "./builderStyles";
import WordPdfGuide from "./WordPdfGuide";

export type ImportMode = "replace" | "append";

// "Import from file" (EXAMS_FEATURE_SPEC.md §4.4): download the template, choose the filled-in CSV or Excel file, see
// what was read and what to check, and send the questions to the builder. Nothing is saved here; the file is read in
// the browser and not kept. When the exam already has questions the person chooses whether the import replaces them
// or goes on the end. The spreadsheet code is loaded when the dialog is first used.
export default function ExamImportDialog({
  answerMode,
  existingCount,
  onApply,
  onClose,
}: {
  answerMode: ExamAnswerMode | undefined;
  existingCount: number;
  onApply: (result: ImportResult, mode: ImportMode) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [mode, setMode] = useState<ImportMode>("append");
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  // Counts the files chosen: a slow read of an earlier file must not replace the result of a later one.
  const reads = useRef(0);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input[type='file']")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, []);

  const handleFile = async (file: File) => {
    const mine = (reads.current += 1);
    const name = file.name.toLowerCase();
    setReading(name.endsWith(".pdf") ? "Reading the PDF…" : name.endsWith(".docx") ? "Reading the Word file…" : "Reading file…");
    setError(null);
    setResult(null);
    try {
      // The reader for this kind of file is loaded now, not with the builder.
      const { readImportFile } = await import("@/lib/examImportRead");
      const read = await readImportFile(file, answerMode);
      if (mine === reads.current) setResult(read);
    } catch (err) {
      if (mine === reads.current) setError(err instanceof Error ? err.message : "That file could not be read.");
    } finally {
      if (mine === reads.current) setReading(null);
    }
  };

  const downloadExample = async () => {
    setDownloading(true);
    try {
      const { downloadExampleDocx } = await import("@/lib/examImportRead");
      await downloadExampleDocx();
    } finally {
      setDownloading(false);
    }
  };

  const found = result?.questions.length ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-import-title"
        className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-md bg-white p-5 dark:bg-gray-800"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 id="exam-import-title" className="pr-8 text-lg font-semibold">
          Import questions from a file
        </h2>

        <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
          <p>
            Use a spreadsheet (CSV or Excel) made from the template, or a Word (.docx) or PDF file laid out as described below. The
            questions open in the builder for you to check; nothing is saved until you press Save, and the file itself is not kept.
          </p>
          <p>
            Spreadsheet columns: {EXAM_IMPORT_HEADERS.join(", ")}. <strong>Correct</strong> lists the right options by letter (B, or
            A,C). <strong>Type</strong> (single or multiple) and <strong>Points</strong> (default 1) are optional. Up to
            100 questions.
          </p>
        </div>

        <WordPdfGuide onDownloadExample={() => void downloadExample()} downloading={downloading} />

        <div>
          <ExportMenu
            formats={["csv", "xlsx"]}
            label="Download template"
            onExport={async (format) => {
              const { downloadExamTemplate } = await import("@/lib/examImportFile");
              downloadExamTemplate(format);
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="exam-import-file" className="text-xs text-gray-500 dark:text-gray-300">
            Choose a CSV, Excel, Word or PDF file
          </label>
          <input
            id="exam-import-file"
            type="file"
            accept=".csv,.xlsx,.docx,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so choosing the same file again reads it again.
              e.target.value = "";
              if (file) void handleFile(file);
            }}
            className="text-sm"
          />
        </div>

        {reading && <p className="text-sm text-gray-500 dark:text-gray-400">{reading}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {result && result.missingHeaders.length > 0 && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            The file is missing the column{result.missingHeaders.length === 1 ? "" : "s"}: {result.missingHeaders.join(", ")}.
            Use the template.
          </p>
        )}

        {result && result.missingHeaders.length === 0 && (
          <div className="flex flex-col gap-3">
            <p role="status" className="text-sm font-medium">
              {found} question{found === 1 ? "" : "s"} found
              {result.warnings.length > 0 ? `, ${result.warnings.length} thing${result.warnings.length === 1 ? "" : "s"} to check` : ""}.
            </p>
            {result.warnings.length > 0 && (
              <ul className="max-h-48 list-disc overflow-y-auto pl-5 text-xs text-amber-700 dark:text-amber-300" aria-label="Things to check">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    {warningPrefix(w)}
                    {w.message}
                  </li>
                ))}
              </ul>
            )}
            {found > 0 && existingCount > 0 && (
              <fieldset className="flex flex-col gap-1 text-sm">
                <legend className="mb-1 text-xs text-gray-500 dark:text-gray-300">
                  This exam already has {existingCount} question{existingCount === 1 ? "" : "s"}
                </legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="import-mode" checked={mode === "append"} onChange={() => setMode("append")} />
                  Add the imported questions to the end
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
                  Replace all the questions with the imported ones
                </label>
              </fieldset>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLS}>
            Cancel
          </button>
          <button
            type="button"
            disabled={found === 0}
            onClick={() => result && onApply(result, existingCount > 0 ? mode : "replace")}
            className={PRIMARY_BUTTON_CLS}
            style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
          >
            Review in the builder
          </button>
        </div>
      </div>
    </div>
  );
}
