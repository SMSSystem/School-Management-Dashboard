import { lazy, Suspense, useState } from "react";
import { Upload } from "lucide-react";
import DialogShell from "@/components/DialogShell";
import RubricFileConfirm from "@/components/rubric/RubricFileConfirm";
import { useRubricActor } from "@/hooks/useRubricActor";
import { useAuth } from "@/lib/AuthContext";
import { formatFileSize } from "@/lib/documentUpload";
import type { ProcessedRubricFile } from "@/lib/rubricFile";
import { chooseRubricFile, type RubricGridRead } from "@/lib/rubricImportRead";
import {
  RUBRIC_FILE_ACCEPT,
  SOFT_SCHOOL_FILE_LIMIT,
  titleFromFileName,
} from "@/lib/rubricFileKinds";
import { createRubricFromFile } from "@/lib/rubricFileStore";
import type { RubricCriterion, RubricDocument } from "@/types/assessment";

const RubricReview = lazy(() => import("@/components/rubric/RubricReview"));

const FIELD_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";

const criteriaCount = (count: number) =>
  `${count} ${count === 1 ? "criterion" : "criteria"}`;

/** What to tell the teacher about the chosen file, and the confirmation it needs. */
function ChosenFileNotes({
  file,
  grid,
  confirmed,
  disabled,
  onChange,
}: {
  file: ProcessedRubricFile;
  grid: RubricGridRead | null;
  confirmed: boolean;
  disabled: boolean;
  onChange: (confirmed: boolean) => void;
}) {
  return (
    <>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        {grid
          ? `The app found a grid with ${criteriaCount(grid.criteria.length)} in this file. Review it before saving, or save the file alone.`
          : "The app didn't find a grid it can read in this file, so only the file is saved. You can add a grid afterwards through Edit."}
      </p>
      {file.warnings.map((warning) => (
        <p key={warning} className="text-xs text-amber-600 dark:text-amber-400">
          {warning}
        </p>
      ))}
      <RubricFileConfirm
        sheets={file.sheetsToCheck}
        confirmed={confirmed}
        disabled={disabled}
        onChange={onChange}
      />
    </>
  );
}

const SECONDARY_CLS =
  "rounded-md border border-gray-300 p-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700";
const PRIMARY_CLS = "bg-blue-400 text-white p-2 rounded-md disabled:opacity-50";

/** The way to save the chosen file: the grid read from it, or the file alone. */
function UploadActions({
  gridFound,
  ready,
  saving,
  onReview,
  onSaveFile,
}: {
  gridFound: boolean;
  ready: boolean;
  saving: boolean;
  onReview: () => void;
  onSaveFile: () => void;
}) {
  const fileLabel = gridFound ? "Save as file only" : "Upload";
  return (
    <>
      {gridFound && (
        <button
          type="button"
          onClick={onReview}
          disabled={!ready || saving}
          className={PRIMARY_CLS}
        >
          Review grid
        </button>
      )}
      <button
        type="button"
        onClick={onSaveFile}
        disabled={!ready || saving}
        className={gridFound ? SECONDARY_CLS : PRIMARY_CLS}
      >
        {saving ? "Saving…" : fileLabel}
      </button>
    </>
  );
}

/** The fields of the upload form. */
function UploadFields({
  file,
  title,
  description,
  duplicate,
  saving,
  onChoose,
  onTitle,
  onDescription,
}: {
  file: ProcessedRubricFile | null;
  title: string;
  description: string;
  duplicate: boolean;
  saving: boolean;
  onChoose: (chosen: File | undefined) => void;
  onTitle: (title: string) => void;
  onDescription: (description: string) => void;
}) {
  return (
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
          onChange={(e) => onChoose(e.target.files?.[0])}
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
          onChange={(e) => onTitle(e.target.value)}
          className={FIELD_CLS}
        />
        {duplicate && (
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
          onChange={(e) => onDescription(e.target.value)}
          className={FIELD_CLS}
        />
      </div>
    </>
  );
}

/** The chosen file and what was read from it. The tick is about one file, so another file needs its own. */
function useChosenFile(onFileName: (fileName: string) => void) {
  const [chosen, setChosen] = useState<{
    file: ProcessedRubricFile;
    grid: RubricGridRead | null;
  } | null>(null);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    setRefusal(null);
    setChosen(null);
    setConfirmed(false);
    // The checks and readers load only now, so their libraries stay out of this page's chunk.
    const result = await chooseRubricFile(picked);
    if (!result.file) {
      setRefusal(result.error);
      return;
    }
    setChosen({ file: result.file, grid: result.grid });
    setCriteria(result.grid?.criteria ?? []);
    onFileName(picked.name);
  };
  return {
    chosen,
    criteria,
    setCriteria,
    confirmed,
    setConfirmed,
    refusal,
    choose,
  };
}

// Uploads a rubric as a file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7). The file is checked in the browser, and
// the app tries to read a grid from it, which the teacher reviews before saving. The file is always kept, so a file with no
// readable grid, or a teacher who doesn't want the grid, makes a file-only rubric. The duplicate title and the school limit use
// the list the page already holds, so they cost no reads.
function UploadForm({
  rubrics,
  onClose,
}: {
  rubrics: Pick<RubricDocument, "title" | "file">[];
  onClose: () => void;
}) {
  const { institutionId } = useAuth();
  const actor = useRubricActor();
  const [reviewing, setReviewing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const {
    chosen,
    criteria,
    setCriteria,
    confirmed,
    setConfirmed,
    refusal,
    choose,
  } = useChosenFile((fileName) =>
    setTitle((current) => current || titleFromFileName(fileName)),
  );
  const error = refusal ?? saveError;

  const trimmedTitle = title.trim();
  const duplicate =
    !!trimmedTitle &&
    rubrics.some(
      (r) => r.title.trim().toLowerCase() === trimmedTitle.toLowerCase(),
    );

  const titleOk = () => {
    setSaveError(trimmedTitle ? null : "Title is required.");
    return !!trimmedTitle;
  };

  const save = async (savedCriteria: RubricCriterion[]) => {
    if (!chosen || !confirmed || !actor || !institutionId || !titleOk()) return;
    setSaving(true);
    try {
      await createRubricFromFile({
        institutionId,
        title: trimmedTitle,
        description: description.trim(),
        file: chosen.file,
        criteria: savedCriteria,
        actor,
      });
      onClose();
    } catch {
      setSaveError("The rubric could not be saved. Please try again.");
      setSaving(false);
    }
  };

  if (reviewing && chosen?.grid) {
    return (
      <Suspense fallback={null}>
        <RubricReview
          fileName={chosen.file.fileName}
          warnings={chosen.grid.warnings}
          replacesGrid={false}
          criteria={criteria}
          onChange={setCriteria}
          saveLabel="Save rubric"
          busy={saving}
          error={error}
          onBack={() => setReviewing(false)}
          onSave={() => void save(criteria)}
        />
      </Suspense>
    );
  }

  return (
    <DialogShell title="Upload a rubric" onClose={onClose} busy={saving}>
      <UploadFields
        file={chosen?.file ?? null}
        title={title}
        description={description}
        duplicate={duplicate}
        saving={saving}
        onChoose={(picked) => void choose(picked)}
        onTitle={setTitle}
        onDescription={setDescription}
      />
      {chosen && (
        <ChosenFileNotes
          file={chosen.file}
          grid={chosen.grid}
          confirmed={confirmed}
          disabled={saving}
          onChange={setConfirmed}
        />
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <UploadActions
        gridFound={!!chosen?.grid}
        ready={!!chosen && confirmed}
        saving={saving}
        onReview={() => {
          if (titleOk()) setReviewing(true);
        }}
        onSaveFile={() => void save([])}
      />
    </DialogShell>
  );
}

/** Shown in place of the form once a school has reached its soft limit of files. */
function LimitReached({ onClose }: { onClose: () => void }) {
  return (
    <DialogShell title="Upload a rubric" onClose={onClose}>
      <p className="text-sm text-red-500">
        Your school has reached its limit of {SOFT_SCHOOL_FILE_LIMIT} rubric
        files. Ask an administrator to delete some.
      </p>
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
  const close = () => setOpen(false);
  const atLimit =
    rubrics.filter((r) => r.file).length >= SOFT_SCHOOL_FILE_LIMIT;
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
      {open &&
        (atLimit ? (
          <LimitReached onClose={close} />
        ) : (
          <UploadForm rubrics={rubrics} onClose={close} />
        ))}
    </>
  );
}
