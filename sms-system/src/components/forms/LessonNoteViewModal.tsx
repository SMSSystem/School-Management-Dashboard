import { useMemo, useState } from "react";
import { Download, Eye, ExternalLink, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import { useLessonNoteDownloadAll } from "@/hooks/useLessonNoteDownloadAll";
import DownloadAllPanel from "./lessonNote/DownloadAllPanel";
import OutsideLink from "@/components/OutsideLink";
import { downloadLessonNoteAttachment } from "@/lib/lessonNoteAttachment";
import { formatFileSize, needsBlobStore } from "@/lib/documentUpload";
import { validateLessonNoteUrl } from "@/lib/lessonNoteLinks";
import { noteFiles } from "@/lib/lessonNoteFiles";
import { classLabel, noteClassIds } from "@/lib/lessonNoteClasses";
import { noteSubjectIds, subjectLabel } from "@/lib/lessonNoteSubjects";
import type { LessonNote } from "@/hooks/useLessonNotes";

// Saving several files in a row on phones and tablets is unproven, so that version stays off in production until it
// has been tested on real devices (LESSON_NOTE_12_FILES_SPEC.md section 9.5). Those devices keep each file's own button.
const SEQUENTIAL_DOWNLOADS_ON = import.meta.env.VITE_SEQUENTIAL_DOWNLOADS === "true";

// Read-only view of one note for every role — standalone like
// RubricViewModal, not threaded through FormModal's editable-form types. Each
// file is fetched only when its "Download" is clicked (§6), never on open.
//
// LessonNoteViewDialog is the controlled dialog (the Lessons page opens it from
// a tapped card on phones); the default export below is the original eye-icon
// button + dialog used in the table. Below md the dialog is a bottom sheet.
export const LessonNoteViewDialog = ({
  note,
  open,
  onClose,
}: {
  note: LessonNote;
  open: boolean;
  onClose: () => void;
}) => {
  const { institutionId, role, user } = useAuth();
  const uid = user?.uid ?? null;
  // The id of the file being fetched, so only that row shows "Downloading…".
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const files = useMemo(() => noteFiles(note), [note]);
  const touchDevice = useMediaQuery("(pointer: coarse)");
  const mode = touchDevice ? "sequential" : "zip";
  const showDownloadAll = !touchDevice || SEQUENTIAL_DOWNLOADS_ON;
  const downloadAll = useLessonNoteDownloadAll({
    uid,
    institutionId,
    role,
    noteId: note.id,
    noteName: note.name,
    files,
    open: open && showDownloadAll,
    mode,
  });
  // Links, the back button and closing the tab ask first while a run is going.
  useNavigationGuard(open && downloadAll.active, "A download is running. Leaving now stops it.");

  if (!open) return null;

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  // Each line is shown only when the note has that value (class and subject are optional).
  const details = [
    { label: noteClassIds(note).length > 1 ? "Classes" : "Class", value: classLabel(note) },
    { label: noteSubjectIds(note).length > 1 ? "Subjects/Courses" : "Subject/Course", value: subjectLabel(note) },
    { label: "Overseen by", value: note.teacherName },
  ].filter((d) => d.value);

  const download = async (file: (typeof files)[number]) => {
    if (!institutionId || !uid) return;
    setError(null);
    setDownloadingId(file.id);
    try {
      await downloadLessonNoteAttachment(uid, institutionId, note.id, file, { role });
      await downloadAll.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the file.");
    } finally {
      setDownloadingId(null);
    }
  };

  // During a run the dialog stays open: a tap outside does nothing, and the X stops the run instead of closing.
  const runFetching = downloadAll.run !== null && downloadAll.run.phase !== "paused";
  const closeOrStop = downloadAll.active ? downloadAll.stop : onClose;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center md:p-4"
      onClick={downloadAll.active ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={note.name}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full md:max-w-xl max-h-[85dvh] md:max-h-[90dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-8 md:py-10"
      >
        {/* Grab handle (phones) */}
        <div className="md:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />

        <button
          className="absolute top-2 right-2 md:top-4 md:right-4 w-10 h-10 md:w-auto md:h-auto flex items-center justify-center text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors"
          onClick={closeOrStop}
          title={downloadAll.active ? "Stop the download" : "Close"}
          aria-label={downloadAll.active ? "Stop the download" : "Close"}
        >
          <X className="w-5 h-5" />
        </button>

        <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-gray-100 leading-tight mb-1.5 pr-8 wrap-break-word">
          {note.name}
        </h1>
        {details.length > 0 && (
          <ul className="text-sm text-slate-500 dark:text-gray-400 mb-5 md:mb-6 flex flex-col gap-0.5">
            {details.map((d) => (
              <li key={d.label}>
                · {d.label}: {d.value}
              </li>
            ))}
          </ul>
        )}

        {files.length > 0 && (
          <div className="mb-6 flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
              {files.length === 1 ? "File" : `${files.length} files, ${formatFileSize(totalBytes)}`}
            </h2>
            {showDownloadAll && <DownloadAllPanel download={downloadAll} mode={mode} />}
            <ul className="flex flex-col gap-3">
              {files.map((file) => {
                const downloading = downloadingId === file.id;
                return (
                  <li key={file.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => download(file)}
                        disabled={downloadingId !== null || runFetching}
                        aria-label={`Download ${file.fileName}`}
                        className="w-full sm:w-auto min-h-11 md:min-h-0 inline-flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 md:px-3 md:py-1.5 rounded-lg md:rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        <Download className="w-4 h-4" />
                        {downloading ? "Downloading…" : "Download"}
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-300 break-all">
                        {file.fileName}
                        {file.size ? ` (${formatFileSize(file.size)})` : ""}
                      </span>
                    </div>
                    {downloading && file.size && needsBlobStore(file.size) ? (
                      <p className="text-xs text-gray-400">This is a large file and may take a moment.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}

        {note.resourceLinks.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
              Links
            </h2>
            <ul className="flex flex-col gap-2">
              {note.resourceLinks.map((link, i) => (
                <li key={i} className="text-sm">
                  {/* Re-validated at render: a link written around the form
                      (e.g. javascript:) is shown as inert text, never an anchor.
                      A teacher typed it, so following it asks first. */}
                  {validateLessonNoteUrl(link.url) === null ? (
                    <OutsideLink
                      href={link.url}
                      leaving="lesson-note"
                      className="flex min-h-11 md:min-h-0 items-center justify-between gap-2 rounded-lg md:rounded-none border border-gray-200 dark:border-gray-700 md:border-0 px-3 md:px-0 py-2 md:py-0 text-sky-700 dark:text-sky-400 hover:underline break-all"
                    >
                      <span className="min-w-0">{link.label || link.url}</span>
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </OutsideLink>
                  ) : (
                    <span className="text-gray-500 break-all">{link.label || link.url}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

const LessonNoteViewModal = ({ note }: { note: LessonNote }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="w-7 h-7 flex items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        onClick={() => setOpen(true)}
        title={`View ${note.name}`}
        aria-label={`View ${note.name}`}
      >
        <Eye className="w-4 h-4 text-white" />
      </button>
      <LessonNoteViewDialog note={note} open={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default LessonNoteViewModal;
