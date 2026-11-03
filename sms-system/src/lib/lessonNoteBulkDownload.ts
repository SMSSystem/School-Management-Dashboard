// Download all for a lesson note (LESSON_NOTE_12_FILES_SPEC.md section 9): which button a person sees, safe file names,
// and the run itself. Pure, with its fetching and saving passed in, so every state can be tested without a browser.

export const SEQUENTIAL_GAP_MS = 1500;
const RETRY_DELAY_MS = 1000;

export type BulkFile = { id: string; fileName: string; size: number };

// ── The button ──────────────────────────────────────────────────────────────

export type DownloadAllButton =
  | { kind: 'none' }
  | { kind: 'all' }
  | { kind: 'remaining'; count: number }
  | { kind: 'complete'; canSaveAgain: boolean };

/** The files not yet handed to the browser. A file added later is remaining, and a removed one drops out. */
export const remainingFiles = <T extends BulkFile>(files: readonly T[], downloaded: Readonly<Record<string, true>>): T[] =>
  files.filter((f) => !downloaded[f.id]);

export function downloadAllButton(input: {
  files: readonly BulkFile[];
  downloaded: Readonly<Record<string, true>>;
  /** Whether Download all was pressed for this note since signing in. */
  clicked: boolean;
  allStored: boolean;
}): DownloadAllButton {
  if (input.files.length < 2) return { kind: 'none' };
  const count = remainingFiles(input.files, input.downloaded).length;
  if (count === 0) return { kind: 'complete', canSaveAgain: input.allStored };
  return count === input.files.length && !input.clicked ? { kind: 'all' } : { kind: 'remaining', count };
}

// ── File names ──────────────────────────────────────────────────────────────

const clean = (name: string): string =>
  // eslint-disable-next-line no-control-regex
  name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();

/** Names for a zip's entries: no folders can be written from stored metadata, and no two entries share a name. */
export function zipEntryNames(files: readonly { fileName: string }[]): string[] {
  const used = new Set<string>();
  return files.map(({ fileName }) => {
    const safe = clean(fileName) || 'file';
    const dot = safe.lastIndexOf('.');
    const stem = dot > 0 ? safe.slice(0, dot) : safe;
    const extension = dot > 0 ? safe.slice(dot) : '';
    let name = safe;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} (${n})${extension}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export const zipFileName = (noteName: string): string => `${clean(noteName).slice(0, 120) || 'lesson-note'}.zip`;

// ── The run ─────────────────────────────────────────────────────────────────

export type RunPhase = 'running' | 'paused' | 'stopped' | 'finished';

export type RunState = {
  phase: RunPhase;
  /** Files finished, including those that failed. */
  processed: number;
  total: number;
  current: string | null;
  failed: { file: BulkFile; reason: string }[];
  /** Why the run ended early by itself: a limit or a pause set by the owner. */
  haltMessage: string | null;
};

/** What a failure means: `retry` is worth one more try, `skip` is not, and `halt` ends the whole run. */
export type FailureKind = 'retry' | 'skip' | 'halt';

export type RunDeps<T extends BulkFile> = {
  /** Sequential: fetch, then save at once, with a gap. Collect: fetch only, with no gap; the caller builds the zip. */
  mode: 'sequential' | 'collect';
  fetchFile: (file: T) => Promise<Blob>;
  saveFile?: (file: T, blob: Blob) => Promise<void>;
  onFileDone?: (file: T, blob: Blob) => void;
  classify: (error: unknown) => FailureKind;
  sleep: (ms: number) => Promise<void>;
  onState: (state: RunState) => void;
};

export type DownloadRun = {
  /** Resolves when the run ends, however it ends. */
  finished: Promise<void>;
  /** Lets the current file finish, then waits. */
  pause: () => void;
  /** Goes back to running by itself. */
  resume: () => void;
  /** While paused: one more file, then wait again. */
  next: () => void;
  /** Starts no further file. A read already under way cannot be cancelled, so its result is still kept. */
  stop: () => void;
};

const reasonOf = (error: unknown): string => (error instanceof Error && error.message) || 'Could not download this file.';

export function startDownloadRun<T extends BulkFile>(files: readonly T[], deps: RunDeps<T>): DownloadRun {
  const state: RunState = { phase: 'running', processed: 0, total: files.length, current: null, failed: [], haltMessage: null };
  let wantPause = false;
  let wantStop = false;
  let stepOnce = false;
  let wake: (() => void) | null = null;

  const emit = () => deps.onState({ ...state, failed: [...state.failed] });
  const wakeUp = () => {
    wake?.();
    wake = null;
  };

  const fetchWithRetry = async (file: T): Promise<Blob> => {
    try {
      return await deps.fetchFile(file);
    } catch (error) {
      if (deps.classify(error) !== 'retry' || wantStop) throw error;
      await deps.sleep(RETRY_DELAY_MS);
      return deps.fetchFile(file);
    }
  };

  const work = async () => {
    emit();
    for (let i = 0; i < files.length; i++) {
      while (wantPause && !stepOnce && !wantStop) {
        state.phase = 'paused';
        state.current = null;
        emit();
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      if (wantStop) break;
      stepOnce = false;
      state.phase = 'running';
      state.current = files[i].fileName;
      emit();
      try {
        const blob = await fetchWithRetry(files[i]);
        await deps.saveFile?.(files[i], blob);
        deps.onFileDone?.(files[i], blob);
      } catch (error) {
        if (deps.classify(error) === 'halt') {
          state.haltMessage = reasonOf(error);
          break;
        }
        state.failed.push({ file: files[i], reason: reasonOf(error) });
      }
      state.processed++;
      emit();
      if (deps.mode === 'sequential' && i < files.length - 1 && !wantStop && !wantPause) await deps.sleep(SEQUENTIAL_GAP_MS);
    }
    state.current = null;
    state.phase = wantStop || state.haltMessage ? 'stopped' : 'finished';
    emit();
  };

  return {
    finished: work(),
    pause: () => {
      wantPause = true;
    },
    resume: () => {
      wantPause = false;
      wakeUp();
    },
    next: () => {
      stepOnce = true;
      wakeUp();
    },
    stop: () => {
      wantStop = true;
      wakeUp();
    },
  };
}
