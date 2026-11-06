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
import { chooseRubricFile, type RubricGridRead } from "@/lib/rubricImportRead";
import { isFileOnly, RUBRIC_FILE_ACCEPT } from "@/lib/rubricFileKinds";
import { removeRubricFile, replaceRubricFile } from "@/lib/rubricFileStore";
import { canControlRubricFile, canUploadRubric } from "@/lib/roleCapabilities";
import type { RubricCriterion, RubricDocument } from "@/types/assessment";

const RubricReview = lazy(() => import("@/components/rubric/RubricReview"));

type Rubric = RubricDocument & { id: string };

const SHARED_WARNING =
  "This changes the file for every assignment using this rubric, including any already graded.";
const SAVE_FAILED = "The change could not be saved. Please try again.";
const ICON_BTN_CLS =
  "flex h-7 w-7 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40";
const ICON_BTN_STYLE = { backgroundColor: "var(--brand-button-bg, #0284c7)" };

/** Cancel, and the ways to go on: the file alone, or a review of the grid read from it. */
function ConfirmActions({
  hasFile,
  gridOffered,
  ready,
  busy,
  onCancel,
  onFileOnly,
  onReview,
}: {
  hasFile: boolean;
  gridOffered: boolean;
  ready: boolean;
  busy: boolean;
  onCancel: () => void;
  onFileOnly: () => void;
  onReview: () => void;
}) {
  const verb = hasFile ? "Replace" : "Attach";
  const primary = `${PRIMARY_BUTTON_CLS} disabled:opacity-50`;
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
      {gridOffered ? (
        <>
          <button
            type="button"
            onClick={onFileOnly}
            disabled={!ready || busy}
            className={`${SECONDARY_BUTTON_CLS} disabled:opacity-50`}
          >
            {verb} file only
          </button>
          <button
            type="button"
            onClick={onReview}
            disabled={!ready || busy}
            className={primary}
            style={ICON_BTN_STYLE}
          >
            Review grid
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onFileOnly}
          disabled={!ready || busy}
          className={primary}
          style={ICON_BTN_STYLE}
        >
          {verb}
        </button>
      )}
    </div>
  );
}

/**
 * Confirms a chosen file. Mounted for one file at a time, so another file starts with the box unticked. When the file holds a
 * grid, the teacher may review it and use it too, but it is never applied without that (spec section 13.2).
 */
function ConfirmFile({
  file,
  grid,
  hasFile,
  hasGrid,
  busy,
  onConfirm,
  onCancel,
}: {
  file: ProcessedRubricFile;
  grid: RubricGridRead | null;
  hasFile: boolean;
  /** The rubric already has a grid. */
  hasGrid: boolean;
  busy: boolean;
  onConfirm: (criteria?: RubricCriterion[]) => void;
  onCancel: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [criteria, setCriteria] = useState(grid?.criteria ?? []);
  if (reviewing && grid) {
    return (
      <Suspense fallback={null}>
        <RubricReview
          fileName={file.fileName}
          warnings={grid.warnings}
          replacesGrid={hasGrid}
          criteria={criteria}
          onChange={setCriteria}
          saveLabel="Save file and grid"
          busy={busy}
          error={null}
          onBack={() => setReviewing(false)}
          onSave={() => onConfirm(criteria)}
        />
      </Suspense>
    );
  }
  const gridOffer = hasGrid
    ? "This file also holds a grid. Review it to replace the rubric's current grid, or keep the current grid and change only the file."
    : "This file also holds a grid. Review it to add it to this rubric, or change only the file.";
  return (
    <DialogShell
      title={hasFile ? "Replace this file?" : "Attach this file?"}
      onClose={onCancel}
      busy={busy}
    >
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {[`${file.fileName}.`, SHARED_WARNING, ...file.warnings].join(" ")}
      </p>
      {grid && (
        <p className="text-sm text-gray-700 dark:text-gray-300">{gridOffer}</p>
      )}
      <RubricFileConfirm
        sheets={file.sheetsToCheck}
        confirmed={confirmed}
        disabled={busy}
        onChange={setConfirmed}
      />
      <ConfirmActions
        hasFile={hasFile}
        gridOffered={!!grid}
        ready={confirmed}
        busy={busy}
        onCancel={onCancel}
        onFileOnly={() => onConfirm()}
        onReview={() => setReviewing(true)}
      />
    </DialogShell>
  );
}

/** Attaches a file to a rubric with none, or replaces its file, after a confirmation. */
function ChooseFile({ rubric }: { rubric: Rubric }) {
  const { institutionId } = useAuth();
  const actor = useRubricActor();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    file: ProcessedRubricFile;
    grid: RubricGridRead | null;
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
    if (result.file) setPending({ file: result.file, grid: result.grid });
    else setError(result.error);
  };

  const confirm = async (criteria?: RubricCriterion[]) => {
    if (!pending || !actor || !institutionId) return;
    setBusy(true);
    try {
      await replaceRubricFile({
        institutionId,
        rubricId: rubric.id,
        title: rubric.title,
        file: pending.file,
        criteria,
        actor,
      });
    } catch {
      setError(SAVE_FAILED);
    }
    setBusy(false);
    setPending(null);
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
      {pending && (
        <ConfirmFile
          file={pending.file}
          grid={pending.grid}
          hasFile={hasFile}
          hasGrid={rubric.criteria.length > 0}
          busy={busy}
          onConfirm={(criteria) => void confirm(criteria)}
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
