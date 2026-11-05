import { useState } from "react";
import { Upload } from "lucide-react";
import DialogShell from "@/components/DialogShell";
import { useRubricActor } from "@/hooks/useRubricActor";
import { useAuth } from "@/lib/AuthContext";
import { formatFileSize } from "@/lib/documentUpload";
import type { ProcessedRubricFile } from "@/lib/rubricFile";
import {
  RUBRIC_FILE_ACCEPT,
  SOFT_SCHOOL_FILE_LIMIT,
  titleFromFileName,
} from "@/lib/rubricFileKinds";
import { createRubricFromFile } from "@/lib/rubricFileStore";
import type { RubricDocument } from "@/types/assessment";

const FIELD_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";

// Uploads a rubric as a file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7). The file is checked in the browser, and
// the rubric is saved as file-only; a grid can be added afterwards through Edit. Reading files into the grid comes in Stage 2.
// The duplicate title and the school limit use the list the page already holds, so they cost no reads.
function UploadForm({
  rubrics,
  onClose,
}: {
  rubrics: Pick<RubricDocument, "title" | "file">[];
  onClose: () => void;
}) {
  const { institutionId } = useAuth();
  const actor = useRubricActor();
  const [file, setFile] = useState<ProcessedRubricFile | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmedTitle = title.trim();
  const duplicate = rubrics.some(
    (r) => r.title.trim().toLowerCase() === trimmedTitle.toLowerCase(),
  );
  const atLimit =
    rubrics.filter((r) => r.file).length >= SOFT_SCHOOL_FILE_LIMIT;

  const choose = async (chosen: File | undefined) => {
    if (!chosen) return;
    setError(null);
    setFile(null);
    // The checks load only now, so the zip library stays out of this page's chunk.
    const { readRubricFile } = await import("@/lib/rubricFile");
    const result = await readRubricFile(chosen);
    if (!result.file) {
      setError(result.error);
      return;
    }
    setFile(result.file);
    setTitle((current) => current || titleFromFileName(chosen.name));
  };

  const save = async () => {
    if (!file || !actor || !institutionId) return;
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createRubricFromFile({
        institutionId,
        title: trimmedTitle,
        description: description.trim(),
        file,
        actor,
      });
      onClose();
    } catch {
      setError("The rubric could not be saved. Please try again.");
      setSaving(false);
    }
  };

  return (
    <DialogShell title="Upload a rubric" onClose={onClose} busy={saving}>
      {atLimit ? (
        <p className="text-sm text-red-500">
          Your school has reached its limit of {SOFT_SCHOOL_FILE_LIMIT} rubric
          files. Ask an administrator to delete some.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="rubric-file" className={LABEL_CLS}>
              File: Excel, CSV, Word, PDF or Markdown, up to 500 KB
            </label>
            <input
              id="rubric-file"
              type="file"
              accept={RUBRIC_FILE_ACCEPT}
              disabled={saving}
              onChange={(e) => void choose(e.target.files?.[0])}
              className="text-sm"
            />
            {file && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {file.fileName} · {formatFileSize(file.size)}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="rubric-title" className={LABEL_CLS}>
              Title
            </label>
            <input
              id="rubric-title"
              value={title}
              maxLength={150}
              disabled={saving}
              onChange={(e) => setTitle(e.target.value)}
              className={FIELD_CLS}
            />
            {duplicate && trimmedTitle && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                A rubric with this title already exists. You can still save this
                one.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="rubric-description" className={LABEL_CLS}>
              Description (optional)
            </label>
            <textarea
              id="rubric-description"
              rows={2}
              value={description}
              maxLength={1000}
              disabled={saving}
              onChange={(e) => setDescription(e.target.value)}
              className={FIELD_CLS}
            />
          </div>
          {file?.warnings.map((warning) => (
            <p
              key={warning}
              className="text-xs text-amber-600 dark:text-amber-400"
            >
              {warning}
            </p>
          ))}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Don&apos;t include student names or marks, or answer keys. Students
            and parents can download this file exactly as it is.
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!file || saving}
            className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
          >
            {saving ? "Saving…" : "Upload"}
          </button>
        </>
      )}
    </DialogShell>
  );
}

/** The button on the Rubrics page, with its dialog. */
export default function RubricUploadDialog({
  rubrics,
}: {
  rubrics: Pick<RubricDocument, "title" | "file">[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        id="tour-rubrics-upload"
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        Upload rubric
      </button>
      {open && <UploadForm rubrics={rubrics} onClose={() => setOpen(false)} />}
    </>
  );
}
