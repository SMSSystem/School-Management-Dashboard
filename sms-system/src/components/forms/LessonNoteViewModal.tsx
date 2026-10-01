import { useState } from "react";
import { Download, Eye, ExternalLink, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { downloadLessonNoteAttachment } from "@/lib/lessonNoteAttachment";
import { validateLessonNoteUrl } from "@/lib/lessonNoteLinks";
import type { LessonNote } from "@/hooks/useLessonNotes";

// Read-only view of one note for every role — standalone like
// RubricViewModal, not threaded through FormModal's editable-form types. The
// file is fetched only when "Download" is clicked (§6), never on open.
const LessonNoteViewModal = ({ note }: { note: LessonNote }) => {
  const { institutionId } = useAuth();
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!institutionId) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadLessonNoteAttachment(institutionId, note.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the file.");
    } finally {
      setDownloading(false);
    }
  };

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

      {open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl px-8 py-10">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors"
              onClick={() => setOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100 leading-tight mb-1.5 pr-8">
              {note.name}
            </h1>
            <p className="text-sm text-slate-500 dark:text-gray-400 mb-6">
              {[note.className, note.subjectName, note.teacherName].filter(Boolean).join(" · ")}
            </p>

            {note.hasAttachment && (
              <div className="mb-6 flex flex-col gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">
                  File
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={download}
                    disabled={downloading}
                    className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {downloading ? "Downloading…" : "Download"}
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-300">
                    {note.attachmentFileName}
                    {note.attachmentSize ? ` (${Math.round(note.attachmentSize / 1024)} KB)` : ""}
                  </span>
                </div>
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
                          (e.g. javascript:) is shown as inert text, never an anchor. */}
                      {validateLessonNoteUrl(link.url) === null ? (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sky-700 dark:text-sky-400 hover:underline break-all"
                        >
                          {link.label || link.url}
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        </a>
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
      )}
    </>
  );
};

export default LessonNoteViewModal;
