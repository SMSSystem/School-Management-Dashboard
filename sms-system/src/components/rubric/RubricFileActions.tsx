import { lazy, Suspense, useRef, useState } from "react";
import { FilePlus2, FileX2, RefreshCw } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import DialogShell from "@/components/DialogShell";
import {
  PRIMARY_BUTTON_CLS,
  SECONDARY_BUTTON_CLS,
} from "@/components/exam/builder/builderStyles";
import RubricFileConfirm from "@/components/rubric/RubricFileConfirm";
import { useRubricActor } from "@/hooks/useRubricActor";
import { useAuth } from "@/lib/AuthContext";
import type { ProcessedRubricFile } from "@/lib/rubricFile";
import { chooseRubricFile, type FoundRubric } from "@/lib/rubricImportRead";
import {
  GRID_SHARED_WARNING,
  isFileOnly,
  RUBRIC_FILE_ACCEPT,
} from "@/lib/rubricFileKinds";
import {
  removeRubricFile,
  replaceGridFromFile,
  replaceRubricFile,
} from "@/lib/rubricFileStore";
import { canControlRubricFile, canUploadRubric } from "@/lib/roleCapabilities";
import type { RubricCriterion, RubricDocument } from "@/types/assessment";

const RubricReview = lazy(() => import("@/components/rubric/RubricReview"));

type Rubric = RubricDocument & { id: string };

const SHARED_WARNING =
  "This changes the file for every assignment using this rubric that hasn't been graded yet.";
const SAVE_FAILED = "The change could not be saved. Please try again.";
const ICON_BTN_CLS =
  "flex h-7 w-7 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40";
const ICON_BTN_STYLE = { backgroundColor: "var(--brand-button-bg, #0284c7)" };

/** Cancel, and replacing or attaching the file as it is. */
function FileActions({
  verb,
  ready,
  busy,
  onCancel,
  onGo,
  goLabel,
}: {
  verb: string;
  ready: boolean;
  busy: boolean;
  onCancel: () => void;
  onGo: () => void;
  goLabel?: string;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className={SECONDARY_BUTTON_CLS}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onGo}
        disabled={!ready || busy}
        className={`${PRIMARY_BUTTON_CLS} disabled:opacity-50`}
        style={ICON_BTN_STYLE}
      >
        {goLabel ?? verb}
      </button>
    </div>
  );
}

/**
 * A chosen file with a grid in it: the grid replaces the rubric's, after a review, and the file isn't kept (D16). When the
 * rubric has a stored file, it is removed in the same save, so a stale file can't disagree with the new grid.
 */
function ConfirmGrid({
  file,
  found,
  hasFile,
  hasGrid,
  busy,
  onConfirm,
  onCancel,
}: {
  file: ProcessedRubricFile;
  found: FoundRubric[];
  hasFile: boolean;
  hasGrid: boolean;
  busy: boolean;
  onConfirm: (criteria: RubricCriterion[]) => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [which, setWhich] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [criteria, setCriteria] = useState(found[0].criteria);
  if (reviewing) {
    return (
      <Suspense fallback={null}>
        <RubricReview
          fileName={file.fileName}
          warnings={found[which].warnings}
          replacesGrid={hasGrid}
          criteria={criteria}
          onChange={setCriteria}
          saveLabel="Save grid"
          busy={busy}
          error={null}
          onBack={() => setReviewing(false)}
          onSave={() => onConfirm(criteria)}
        />
      </Suspense>
    );
  }
  return (
    <DialogShell
      title={
        hasFile ? "Replace with this file's grid?" : "Use this file's grid?"
      }
      onClose={onCancel}
      busy={busy}
    >
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {[
          `The app found a grid in ${file.fileName}. Review it to use it as this rubric's grid.`,
          "Only the grid is kept, not the file.",
          hasFile ? "The rubric's stored file is removed." : "",
          GRID_SHARED_WARNING,
        ]
          .filter(Boolean)
          .join(" ")}
      </p>
      {found.length > 1 && (
        <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300">
          Rubric to use
          <select
            value={which}
            disabled={busy}
            onChange={(e) => {
              setWhich(Number(e.target.value));
              setCriteria(found[Number(e.target.value)].criteria);
            }}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900"
          >
            {found.map((item, i) => (
              <option key={`${i}:${item.source}`} value={i}>
                {item.heading ? `${item.source}: ${item.heading}` : item.source}
              </option>
            ))}
          </select>
        </label>
      )}
      <RubricFileConfirm
        grid
        sheets={[]}
        confirmed={confirmed}
        disabled={busy}
        onChange={setConfirmed}
      />
      <FileActions
        verb="Review grid"
        ready={confirmed}
        busy={busy}
        onCancel={onCancel}
        onGo={() => setReviewing(true)}
      />
    </DialogShell>
  );
}

/** A chosen file with no grid in it: it is stored whole, after a confirmation. Mounted per file, so the box starts unticked. */
function ConfirmFile({
  file,
  hasFile,
  busy,
  onConfirm,
  onCancel,
}: {
  file: ProcessedRubricFile;
  hasFile: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <DialogShell
      title={hasFile ? "Replace this file?" : "Attach this file?"}
      onClose={onCancel}
      busy={busy}
    >
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {[`${file.fileName}.`, SHARED_WARNING, ...file.warnings].join(" ")}
      </p>
      <RubricFileConfirm
        sheets={file.sheetsToCheck}
        confirmed={confirmed}
        disabled={busy}
        onChange={setConfirmed}
      />
      <FileActions
        verb={hasFile ? "Replace" : "Attach"}
        ready={confirmed}
        busy={busy}
        onCancel={onCancel}
        onGo={onConfirm}
      />
    </DialogShell>
  );
}

/** Attaches a file to a rubric with none, or replaces its file or its grid, after a confirmation. */
function ChooseFile({ rubric }: { rubric: Rubric }) {
  const { institutionId } = useAuth();
  const actor = useRubricActor();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    file: ProcessedRubricFile;
    found: FoundRubric[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFile = !!rubric.file;
  const label = hasFile
    ? `Replace the file of ${rubric.title}`
    : `Attach a file to ${rubric.title}`;
  const Icon = hasFile ? RefreshCw : FilePlus2;

  const choose = async (chosen: File | undefined) => {
    if (input.current) input.current.value = ""; // so the same file can be chosen again
    if (!chosen) return;
    setError(null);
    const result = await chooseRubricFile(chosen);
    if (result.file) setPending({ file: result.file, found: result.rubrics });
    else setError(result.error);
  };

  const save = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch {
      setError(SAVE_FAILED);
    }
    setBusy(false);
    setPending(null);
  };

  const saveGrid = (criteria: RubricCriterion[]) => {
    if (!pending || !actor || !institutionId) return;
    void save(() =>
      replaceGridFromFile({
        institutionId,
        rubricId: rubric.id,
        title: rubric.title,
        criteria,
        fileName: pending.file.fileName,
        removeFile: hasFile,
        actor,
      }),
    );
  };

  const saveFile = () => {
    if (!pending || !actor || !institutionId) return;
    void save(() =>
      replaceRubricFile({
        institutionId,
        rubricId: rubric.id,
        title: rubric.title,
        file: pending.file,
        actor,
      }),
    );
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={RUBRIC_FILE_ACCEPT}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      <button
        type="button"
        className={ICON_BTN_CLS}
        style={ICON_BTN_STYLE}
        title={label}
        aria-label={label}
        onClick={() => input.current?.click()}
      >
        <Icon className="h-4 w-4 text-white" aria-hidden="true" />
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
      {pending && pending.found.length > 0 && (
        <ConfirmGrid
          file={pending.file}
          found={pending.found}
          hasFile={hasFile}
          hasGrid={rubric.criteria.length > 0}
          busy={busy}
          onConfirm={saveGrid}
          onCancel={() => setPending(null)}
        />
      )}
      {pending && pending.found.length === 0 && (
        <ConfirmFile
          file={pending.file}
          hasFile={hasFile}
          busy={busy}
          onConfirm={saveFile}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}

/** Removes a rubric's file and keeps its grid. Off for a file-only rubric, which would be left with neither. */
function RemoveFile({
  rubric,
  fileName,
}: {
  rubric: Rubric;
  fileName: string;
}) {
  const { institutionId } = useAuth();
  const actor = useRubricActor();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileOnly = isFileOnly(rubric);

  const confirm = async () => {
    if (!actor || !institutionId) return;
    setBusy(true);
    setError(null);
    try {
      await removeRubricFile({
        institutionId,
        rubricId: rubric.id,
        title: rubric.title,
        fileName,
        actor,
      });
    } catch {
      setError(SAVE_FAILED);
    }
    setBusy(false);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={ICON_BTN_CLS}
        style={ICON_BTN_STYLE}
        disabled={fileOnly}
        title={
          fileOnly
            ? "This rubric has no grid, so its file can't be removed. Replace or delete it instead."
            : `Remove the file of ${rubric.title}`
        }
        aria-label={`Remove the file of ${rubric.title}`}
        onClick={() => setOpen(true)}
      >
        <FileX2 className="h-4 w-4 text-white" aria-hidden="true" />
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
      {open && (
        <ConfirmDialog
          title="Remove this file?"
          message={`${SHARED_WARNING} The rubric's grid stays.`}
          confirmLabel="Remove"
          tone="danger"
          busy={busy}
          onConfirm={() => void confirm()}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

// A table row's controls for a rubric's file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D4). Any teacher may attach a file
// to a rubric with none, as they may edit its grid. Only the uploader or an admin may replace or remove one, which the rules
// enforce. The checks and readers load only when a file is chosen, so their libraries stay out of this page's chunk.
export default function RubricFileActions({ rubric }: { rubric: Rubric }) {
  const { role, user } = useAuth();
  if (!rubric.file)
    return canUploadRubric(role) ? <ChooseFile rubric={rubric} /> : null;
  if (!canControlRubricFile(role, user?.uid, rubric.file)) return null;
  return (
    <>
      <ChooseFile rubric={rubric} />
      <RemoveFile rubric={rubric} fileName={rubric.file.fileName} />
    </>
  );
}
