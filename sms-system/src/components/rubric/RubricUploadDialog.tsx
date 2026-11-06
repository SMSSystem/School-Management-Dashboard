import { lazy, Suspense, useState } from "react";
import { Upload } from "lucide-react";
import DialogShell from "@/components/DialogShell";
import RubricFileConfirm from "@/components/rubric/RubricFileConfirm";
import RubricPicker, {
  type RubricPick,
} from "@/components/rubric/RubricPicker";
import { useRubricActor } from "@/hooks/useRubricActor";
import { useAuth } from "@/lib/AuthContext";
import { formatFileSize } from "@/lib/documentUpload";
import type { ProcessedRubricFile } from "@/lib/rubricFile";
import { chooseRubricFile, type FoundRubric } from "@/lib/rubricImportRead";
import {
  RUBRIC_FILE_ACCEPT,
  SOFT_SCHOOL_FILE_LIMIT,
  titleFromFileName,
} from "@/lib/rubricFileKinds";
import {
  createRubricFromFile,
  createRubricFromGrid,
} from "@/lib/rubricFileStore";
import { initialTitle, queueFromPicks, type Queued } from "@/lib/rubricTitles";
import type { RubricCriterion, RubricDocument } from "@/types/assessment";

const RubricReview = lazy(() => import("@/components/rubric/RubricReview"));

const FIELD_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";
const PRIMARY_CLS = "bg-blue-400 text-white p-2 rounded-md disabled:opacity-50";
const SAVE_FAILED = "The rubric could not be saved. Please try again.";

type Listed = Pick<RubricDocument, "title" | "file">;
type Chosen = { file: ProcessedRubricFile; rubrics: FoundRubric[] };

/** The chosen file and what was read from it. The tick is about one file, so another file needs its own. */
function useChosenFile(onFileName: (fileName: string) => void) {
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [picks, setPicks] = useState<RubricPick[]>([]);
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
    setChosen({ file: result.file, rubrics: result.rubrics });
    setPicks(
      result.rubrics.map((r) => ({
        include: true,
        title: initialTitle(r.heading),
      })),
    );
    onFileName(picked.name);
  };
  /** Takes the saved rubrics off the list, after a review stopped part way. */
  const dropSaved = (saved: ReadonlySet<number>) => {
    if (!chosen) return;
    setChosen({
      ...chosen,
      rubrics: chosen.rubrics.filter((_, i) => !saved.has(i)),
    });
    setPicks((all) => all.filter((_, i) => !saved.has(i)));
  };
  const setPick = (index: number, pick: RubricPick) =>
    setPicks((all) => all.map((p, i) => (i === index ? pick : p)));
  return {
    chosen,
    picks,
    setPick,
    confirmed,
    setConfirmed,
    refusal,
    choose,
    dropSaved,
  };
}

/** The file box, and for a file with no grid, its title. */
function UploadFields({
  file,
  showTitle,
  title,
  description,
  duplicate,
  saving,
  onChoose,
  onTitle,
  onDescription,
}: {
  file: ProcessedRubricFile | null;
  showTitle: boolean;
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
      {showTitle && (
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
      )}
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

/** A file with no grid in it: it is stored whole, so the teacher confirms the whole file (D13). */
function StoredFileNotes({
  file,
  atLimit,
  confirmed,
  disabled,
  onChange,
}: {
  file: ProcessedRubricFile;
  atLimit: boolean;
  confirmed: boolean;
  disabled: boolean;
  onChange: (confirmed: boolean) => void;
}) {
  return (
    <>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        The app didn't find a grid it can read in this file, so the file itself
        is saved. You can add a grid afterwards through Edit.
      </p>
      {atLimit && (
        <p className="text-xs text-red-500">
          Your school has reached its limit of {SOFT_SCHOOL_FILE_LIMIT} rubric
          files. Ask an administrator to delete some, or upload a file the app
          can read into a grid.
        </p>
      )}
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

/** The review of one queued rubric. Going back keeps what was already saved: those are the ticked ones no longer queued. */
function GridReview({
  chosen,
  picks,
  queue,
  criteria,
  onChange,
  saving,
  error,
  onBack,
  onSave,
}: {
  chosen: Chosen;
  picks: readonly RubricPick[];
  queue: readonly Queued[];
  criteria: RubricCriterion[];
  onChange: React.Dispatch<React.SetStateAction<RubricCriterion[]>>;
  saving: boolean;
  error: string | null;
  onBack: (saved: ReadonlySet<number>) => void;
  onSave: () => void;
}) {
  const found = chosen.rubrics;
  const current = queue[0];
  const saved = new Set(
    found
      .map((_, i) => i)
      .filter((i) => picks[i]?.include && !queue.some((q) => q.index === i)),
  );
  const where = found.length > 1 ? `${found[current.index].source}: ` : "";
  return (
    <Suspense fallback={null}>
      <RubricReview
        heading={`${where}${current.title}`}
        fileName={chosen.file.fileName}
        warnings={found[current.index].warnings}
        replacesGrid={false}
        criteria={criteria}
        onChange={onChange}
        saveLabel={
          queue.length > 1 ? "Save and review the next" : "Save rubric"
        }
        busy={saving}
        error={error}
        onBack={() => onBack(saved)}
        onSave={onSave}
      />
    </Suspense>
  );
}

type ChosenFileState = ReturnType<typeof useChosenFile>;

/**
 * Saving what was chosen: each queued grid in turn, as a rubric with no file (D16), or a file with no grid, stored whole. A
 * review stopped part way keeps what was saved, and the rest return to the list.
 */
function useUploadSaves(
  file: ChosenFileState,
  fields: { title: string; description: string; atLimit: boolean },
  onClose: () => void,
) {
  const { institutionId } = useAuth();
  const actor = useRubricActor();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const { chosen, picks, confirmed } = file;
  const found = chosen?.rubrics ?? [];
  const description = fields.description.trim();

  const startReview = () => {
    if (!chosen || !confirmed) return;
    const result = queueFromPicks(
      picks,
      found.map((f) => f.heading),
      chosen.file.fileName,
    );
    if ("error" in result) return setSaveError(result.error);
    setSaveError(null);
    setQueue(result.queue);
    setCriteria(found[result.queue[0].index].criteria);
  };

  const stopReview = (saved: ReadonlySet<number>) => {
    file.dropSaved(saved);
    setQueue([]);
  };

  const run = async (work: () => Promise<void>) => {
    setSaving(true);
    try {
      await work();
      setSaveError(null);
    } catch {
      setSaveError(SAVE_FAILED);
    }
    setSaving(false);
  };

  const saveGrid = () => {
    const [current, ...rest] = queue;
    if (!chosen || !current || !actor || !institutionId) return;
    void run(async () => {
      await createRubricFromGrid({
        institutionId,
        title: current.title,
        description,
        criteria,
        fileName: chosen.file.fileName,
        actor,
      });
      setSavedCount((n) => n + 1);
      if (rest.length === 0) return onClose();
      setQueue(rest);
      setCriteria(found[rest[0].index].criteria);
    });
  };

  const saveFile = () => {
    if (!chosen || !confirmed || fields.atLimit || !actor || !institutionId)
      return;
    const title = fields.title.trim();
    if (!title) return setSaveError("Title is required.");
    void run(async () => {
      await createRubricFromFile({
        institutionId,
        title,
        description,
        file: chosen.file,
        actor,
      });
      onClose();
    });
  };

  return {
    saving,
    saveError,
    queue,
    criteria,
    setCriteria,
    savedCount,
    resetSaved: () => setSavedCount(0),
    startReview,
    stopReview,
    saveGrid,
    saveFile,
  };
}

/** What the chosen file needs before saving: the rubrics found and the tick for their grids, or the file's own notes. */
function ChosenSection({
  file,
  existingTitles,
  atLimit,
  saving,
}: {
  file: ChosenFileState;
  existingTitles: string[];
  atLimit: boolean;
  saving: boolean;
}) {
  const { chosen } = file;
  if (!chosen) return null;
  if (chosen.rubrics.length === 0)
    return (
      <StoredFileNotes
        file={chosen.file}
        atLimit={atLimit}
        confirmed={file.confirmed}
        disabled={saving}
        onChange={file.setConfirmed}
      />
    );
  return (
    <>
      <RubricPicker
        found={chosen.rubrics}
        fileName={chosen.file.fileName}
        picks={file.picks}
        existingTitles={existingTitles}
        disabled={saving}
        onChange={file.setPick}
      />
      <RubricFileConfirm
        grid
        sheets={[]}
        confirmed={file.confirmed}
        disabled={saving}
        onChange={file.setConfirmed}
      />
    </>
  );
}

// Uploads a rubric (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7, D16, D18 and D23). The file is checked in the
// browser and read. When rubrics are found, the teacher picks the ones to keep and their titles, confirms the grids hold no
// student data, and reviews each in turn; each is saved as a grid, and the file itself is never stored. A file with no readable
// grid is stored whole after its own confirmation. The duplicate title and the school limit use the list the page already holds.
function UploadForm({
  rubrics,
  onClose,
}: {
  rubrics: Listed[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const file = useChosenFile((fileName) =>
    setTitle((current) => current || titleFromFileName(fileName)),
  );
  const atLimit =
    rubrics.filter((r) => r.file).length >= SOFT_SCHOOL_FILE_LIMIT;
  const saves = useUploadSaves(file, { title, description, atLimit }, onClose);
  const { chosen, confirmed } = file;
  const gridFound = !!chosen && chosen.rubrics.length > 0;
  const trimmedTitle = title.trim().toLowerCase();
  const duplicate =
    !!trimmedTitle &&
    rubrics.some((r) => r.title.trim().toLowerCase() === trimmedTitle);
  const error = file.refusal ?? saves.saveError;

  if (saves.queue.length > 0 && chosen) {
    return (
      <GridReview
        chosen={chosen}
        picks={file.picks}
        queue={saves.queue}
        criteria={saves.criteria}
        onChange={saves.setCriteria}
        saving={saves.saving}
        error={saves.saveError}
        onBack={saves.stopReview}
        onSave={saves.saveGrid}
      />
    );
  }

  return (
    <DialogShell title="Upload a rubric" onClose={onClose} busy={saves.saving}>
      <UploadFields
        file={chosen?.file ?? null}
        showTitle={!gridFound}
        title={title}
        description={description}
        duplicate={duplicate}
        saving={saves.saving}
        onChoose={(picked) => {
          saves.resetSaved();
          void file.choose(picked);
        }}
        onTitle={setTitle}
        onDescription={setDescription}
      />
      {saves.savedCount > 0 && (
        <p role="status" className="text-xs text-green-700 dark:text-green-400">
          {saves.savedCount} saved. The rest weren't.
        </p>
      )}
      <ChosenSection
        file={file}
        existingTitles={rubrics.map((r) => r.title)}
        atLimit={atLimit}
        saving={saves.saving}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {gridFound ? (
        <button
          type="button"
          onClick={saves.startReview}
          disabled={!confirmed || saves.saving}
          className={PRIMARY_CLS}
        >
          Review grid
        </button>
      ) : (
        <button
          type="button"
          onClick={saves.saveFile}
          disabled={!chosen || !confirmed || atLimit || saves.saving}
          className={PRIMARY_CLS}
        >
          {saves.saving ? "Saving…" : "Upload"}
        </button>
      )}
    </DialogShell>
  );
}

/** The button on the Rubrics page, with its dialog. */
export default function RubricUploadDialog({ rubrics }: { rubrics: Listed[] }) {
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
