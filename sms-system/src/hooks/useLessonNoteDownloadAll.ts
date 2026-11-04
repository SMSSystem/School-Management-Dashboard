import { useCallback, useEffect, useRef, useState } from "react";
import { BlobMissingError, BlobStoppedError, readDownloadGate } from "@/lib/blobStore";
import {
  DOWNLOADS_STOPPED_MESSAGE,
  DOWNLOAD_ALL_OFF_MESSAGE,
  LARGE_FILE_READS_PAUSED_MESSAGE,
} from "@/lib/downloadGate";
import { saveBlob } from "@/lib/downloadFile";
import { loadNoteFile } from "@/lib/lessonNoteAttachment";
import {
  downloadAllButton,
  remainingFiles,
  startDownloadRun,
  zipFileName,
  type BulkFile,
  type DownloadAllButton,
  type DownloadRun,
  type FailureKind,
  type RunState,
} from "@/lib/lessonNoteBulkDownload";
import { hasStoredFiles, markClicked, markDownloaded, readLedger } from "@/lib/noteFileStore";

// Runs Download all for one note: desktop builds one zip, phones and tablets save one file at a time
// (lessonNoteBulkDownload.ts). Fetched files go into this device's store first, so a Stop, a skip or a blocked save
// never spends quota twice. A run ends if the dialog closes.

const classify = (error: unknown): FailureKind => {
  if (error instanceof BlobStoppedError) return "halt";
  return error instanceof BlobMissingError ? "skip" : "retry";
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const GATE_UNAVAILABLE_MESSAGE = "Could not check the download limit. Check your connection and try again.";

export type ZipDecision = { count: number; save: () => void; discard: () => void };

export function useLessonNoteDownloadAll(input: {
  uid: string | null;
  institutionId: string | null;
  noteId: string;
  noteName: string;
  files: readonly BulkFile[];
  open: boolean;
  mode: "zip" | "sequential";
}) {
  const { uid, institutionId, noteId, noteName, files, open, mode } = input;
  const [downloaded, setDownloaded] = useState<Record<string, true>>({});
  const [clicked, setClicked] = useState(false);
  const [allStored, setAllStored] = useState(false);
  const [run, setRun] = useState<RunState | null>(null);
  const [skipped, setSkipped] = useState<BulkFile[]>([]);
  const [zipDecision, setZipDecision] = useState<ZipDecision | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const runRef = useRef<DownloadRun | null>(null);
  const lastStateRef = useRef<RunState | null>(null);
  const closedRef = useRef(false);
  const filesKey = files.map((f) => f.id).join(",");

  const refresh = useCallback(async () => {
    if (!uid) return;
    const [ledger, stored] = await Promise.all([readLedger(uid, noteId), hasStoredFiles(uid, noteId, files)]);
    if (closedRef.current) return;
    setDownloaded(ledger.downloaded);
    setClicked(ledger.clickedAt !== undefined);
    setAllStored(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, noteId, filesKey]);

  useEffect(() => {
    if (!open) return;
    closedRef.current = false;
    void refresh();
    return () => {
      // Files not yet started are stopped; a read under way still lands in the store.
      closedRef.current = true;
      runRef.current?.stop();
      runRef.current = null;
    };
  }, [open, refresh]);

  const finishZip = useCallback(
    async (collected: { file: BulkFile; blob: Blob }[]) => {
      if (collected.length === 0 || !uid) return;
      const { buildNoteZip } = await import("@/lib/lessonNoteZip");
      saveBlob(await buildNoteZip(collected.map(({ file, blob }) => ({ fileName: file.fileName, blob }))), zipFileName(noteName));
      await markDownloaded(uid, noteId, collected.map(({ file }) => file.id));
    },
    [uid, noteId, noteName],
  );

  /** Works through these files. `fromDevice` means every one is already here, so the limits and the ledger are left out. */
  const begin = useCallback(
    async (queue: readonly BulkFile[], fromDevice: boolean) => {
      if (!uid || !institutionId || queue.length === 0) return;
      setMessage(null);
      setSkipped([]);
      if (!fromDevice) {
        const stored = await hasStoredFiles(uid, noteId, queue);
        if (!stored) {
          const gate = await readDownloadGate(institutionId);
          const refusal = !gate
            ? GATE_UNAVAILABLE_MESSAGE
            : gate.readsPaused
              ? LARGE_FILE_READS_PAUSED_MESSAGE
              : gate.level === "hard"
                ? DOWNLOADS_STOPPED_MESSAGE
                : gate.level === "soft"
                  ? DOWNLOAD_ALL_OFF_MESSAGE
                  : null;
          if (refusal) {
            setMessage(refusal);
            return;
          }
        }
        await markClicked(uid, noteId);
      }
      const collected: { file: BulkFile; blob: Blob }[] = [];
      const started = startDownloadRun(queue, {
        mode: mode === "zip" ? "collect" : "sequential",
        fetchFile: (file) => loadNoteFile(uid, institutionId, noteId, file, { strictCounter: true }),
        saveFile:
          mode === "sequential"
            ? async (file, blob) => {
                saveBlob(blob, file.fileName);
                await markDownloaded(uid, noteId, [file.id]);
              }
            : undefined,
        onFileDone: mode === "zip" ? (file, blob) => collected.push({ file, blob }) : undefined,
        classify,
        sleep,
        onState: (state) => {
          lastStateRef.current = state;
          if (!closedRef.current) setRun(state);
        },
      });
      runRef.current = started;
      await started.finished;
      if (runRef.current === started) runRef.current = null;
      if (closedRef.current) return;
      const last = lastStateRef.current;
      setRun(null);
      if (last?.haltMessage) setMessage(last.haltMessage);
      setSkipped(last?.failed.map(({ file }) => file) ?? []);
      if (mode === "zip" && collected.length > 0) {
        if (last?.phase === "stopped" && !last.haltMessage) {
          setZipDecision({
            count: collected.length,
            save: () => {
              setZipDecision(null);
              void finishZip(collected).then(refresh);
            },
            discard: () => {
              setZipDecision(null); // the copies stay on this device, so nothing fetched is wasted
              void refresh();
            },
          });
          return;
        }
        await finishZip(collected);
      }
      await refresh();
    },
    [uid, institutionId, noteId, mode, finishZip, refresh],
  );

  const remaining = remainingFiles(files, downloaded);
  const button: DownloadAllButton = downloadAllButton({ files, downloaded, clicked, allStored });
  const active = run !== null || zipDecision !== null;

  return {
    button,
    /** The size of what the next run would fetch. */
    remainingBytes: remaining.reduce((sum, f) => sum + f.size, 0),
    remainingCount: remaining.length,
    run,
    active,
    skipped,
    zipDecision,
    message,
    startRemaining: () => begin(remaining, false),
    retrySkipped: () => begin(skipped, false),
    saveAgain: () => begin(files, true),
    pause: () => runRef.current?.pause(),
    resume: () => runRef.current?.resume(),
    next: () => runRef.current?.next(),
    stop: () => runRef.current?.stop(),
    refresh,
  };
}
