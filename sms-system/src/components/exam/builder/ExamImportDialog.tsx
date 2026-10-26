import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { EXAM_IMPORT_HEADERS, warningPrefix, type ImportResult } from "@/lib/examImport";
import type { ImportPicture } from "@/lib/examImportPictures";
import {
  addSnapshot,
  applyPrepared,
  chosen,
  moveItem,
  preparePictures,
  removeItem,
  startReview,
  keepAllClear,
  keepItem,
  type ImportedPicture,
  type ReviewItem,
} from "@/lib/examImportReview";
import type { ExamAnswerMode } from "@/types/exams";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "./builderStyles";
import ImportImageReview from "./ImportImageReview";
import PdfSnapshot from "./PdfSnapshot";
import TemplateMenu from "./TemplateMenu";
import WordPdfGuide from "./WordPdfGuide";

export type ImportMode = "replace" | "append";

// "Import from file" (EXAMS_FEATURE_SPEC.md §4.4): download a template, choose the filled-in file, see
// what was read and what to check, and send the questions to the builder. Nothing is saved here; the file is read in
// the browser and not kept. When the exam already has questions the person chooses whether the import replaces them
// or goes on the end. A Word file that held pictures gets one more step before the builder: the pictures are checked
// one by one and the person decides where each goes (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.4). The spreadsheet code is
// loaded when the dialog is first used, and the picture code only when that step opens.
export default function ExamImportDialog({
  answerMode,
  existingCount,
  onApply,
  onClose,
}: {
  answerMode: ExamAnswerMode | undefined;
  existingCount: number;
  onApply: (result: ImportResult, mode: ImportMode, pictures: ImportedPicture[]) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<"file" | "pictures" | "snapshot">("file");
  // Where the snapshot panel returns to, and the snapshots taken (they follow the file's own pictures in one list).
  const [snapshotFrom, setSnapshotFrom] = useState<"file" | "pictures">("file");
  const [snapshots, setSnapshots] = useState<ImportPicture[]>([]);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  // Counts the files chosen: a slow read of an earlier file must not replace the result of a later one.
  const reads = useRef(0);
  // Counts the runs of the picture check: going back, choosing another file or closing the dialog ends the one running.
  const checks = useRef(0);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(
    () => () => {
      checks.current += 1;
    },
    [],
  );

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
    setReading(
      name.endsWith(".pdf") ? "Reading the PDF…" : name.endsWith(".docx") ? "Reading the Word file…" : name.endsWith(".md") || name.endsWith(".markdown") ? "Reading the Markdown file…" : "Reading file…",
    );
    setError(null);
    setResult(null);
    setStep("file");
    setItems([]);
    setSnapshots([]);
    checks.current += 1;
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

  const found = result?.questions.length ?? 0;
  const hasPictures = (result?.images?.length ?? 0) > 0;
  const canSnapshot = result?.source?.kind === "pdf";
  // The pictures of the file, then the snapshots: an item's index is its place in this list.
  const pictures = useMemo(() => [...(result?.pictures ?? []), ...snapshots], [result, snapshots]);

  // Puts every picture that has not been checked through the picture check (a lazy chunk), one at a time, while the person
  // looks at the grid. A newer run ends the one before it.
  const checkPictures = async (list: ReviewItem[], all: readonly ImportPicture[]) => {
    const mine = (checks.current += 1);
    const { prepareImage } = await import("@/lib/examImageCanvas");
    await preparePictures(
      list,
      all,
      (bytes) => prepareImage(new Blob([bytes as BlobPart])),
      (index, outcome) => setItems((current) => applyPrepared(current, index, outcome)),
      () => mine !== checks.current,
    );
  };

  // Opens the picture step: the list is made once from what the file held (nothing, for a PDF the person wants to take a
  // snapshot of).
  const openPictures = async () => {
    if (!result) return;
    const list = items.length > 0 ? items : startReview(result.images ?? [], result.pictures ?? []);
    setItems(list);
    setStep("pictures");
    await checkPictures(list, pictures);
  };

  const openSnapshot = (from: "file" | "pictures") => {
    checks.current += 1;
    setSnapshotFrom(from);
    setStep("snapshot");
  };

  // A snapshot becomes one more item of the list, on the question chosen, and goes through the picture check.
  const takeSnapshot = (png: Uint8Array, questionIndex: number) => {
    if (!result) return;
    const picture: ImportPicture = { bytes: png, format: "png", alt: "", cropped: false };
    const all = [...pictures, picture];
    const base = items.length > 0 ? items : startReview(result.images ?? [], result.pictures ?? []);
    const list = addSnapshot(base, all.length - 1, questionIndex);
    setSnapshots((current) => [...current, picture]);
    setItems(list);
    setStep("pictures");
    void checkPictures(list, all);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-import-title"
        className={
          step !== "file"
            ? "relative flex max-h-[90dvh] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-md bg-white p-5 dark:bg-gray-800"
            : "relative flex max-h-[90dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-md bg-white p-5 dark:bg-gray-800"
        }
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
          {step === "pictures" ? "Pictures in the file" : step === "snapshot" ? "Add a snapshot of a figure" : "Import questions from a file"}
        </h2>

        {step === "snapshot" && result?.source ? (
          <PdfSnapshot
            bytes={result.source.bytes}
            questions={result.questions}
            onAdd={takeSnapshot}
            onCancel={() => {
              setStep(snapshotFrom);
              if (snapshotFrom === "pictures") void checkPictures(items, pictures);
            }}
          />
        ) : step === "pictures" && result ? (
          <ImportImageReview
            items={items}
            questions={result.questions}
            onUse={(index) => setItems((list) => keepItem(list, index))}
            onMove={(index, questionIndex) => setItems((list) => moveItem(list, index, questionIndex))}
            onRemove={(index) => setItems((list) => removeItem(list, index))}
            onUseAllClear={() => setItems((list) => keepAllClear(list))}
            onAddSnapshot={canSnapshot ? () => openSnapshot("pictures") : undefined}
            onBack={() => {
              checks.current += 1;
              setStep("file");
            }}
            onContinue={() => onApply(result, existingCount > 0 ? mode : "replace", chosen(items))}
          />
        ) : (
          <>

        <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-300">
          <p>
            Use a spreadsheet (CSV or Excel) made from the template, or a Word (.docx), PDF or Markdown (.md) file laid out as described below. The
            questions open in the builder for you to check; nothing is saved until you press Save, and the file itself is not kept. A Word or
            PDF file can carry pictures: after you choose it, a step lets you check where each picture goes.
          </p>
          <p>
            Spreadsheet columns: {EXAM_IMPORT_HEADERS.join(", ")}. <strong>Correct</strong> lists the right options by letter (B, or
            A,C). <strong>Type</strong> (single or multiple) and <strong>Points</strong> (default 1) are optional. Up to
            100 questions.
          </p>
        </div>

        <WordPdfGuide />

        <div>
          <TemplateMenu />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="exam-import-file" className="text-xs text-gray-500 dark:text-gray-300">
            Choose a CSV, Excel, Word, PDF or Markdown file
          </label>
          <input
            id="exam-import-file"
            type="file"
            accept=".csv,.xlsx,.docx,.pdf,.md,.markdown"
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
          {canSnapshot && !hasPictures && found > 0 && (
            <button type="button" onClick={() => openSnapshot("file")} className={SECONDARY_BUTTON_CLS}>
              Add a snapshot of a figure
            </button>
          )}
          <button
            type="button"
            disabled={found === 0}
            onClick={() => {
              if (!result) return;
              if (hasPictures) void openPictures();
              else onApply(result, existingCount > 0 ? mode : "replace", []);
            }}
            className={PRIMARY_BUTTON_CLS}
            style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
          >
            {hasPictures ? "Review the pictures" : "Review in the builder"}
          </button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
