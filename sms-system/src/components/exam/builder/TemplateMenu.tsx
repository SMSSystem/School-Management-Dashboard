import { useEffect, useRef, useState } from "react";

type Template = { key: "xlsx" | "csv" | "docx" | "pdf" | "md"; label: string };

// The templates of the exam import, one per kind of file it reads (EXAMS_FEATURE_SPEC.md §4.4). The spreadsheet ones come
// from examImportFile (which loads the spreadsheet library), the others are made in the browser by examImportRead; each is
// loaded only when its entry is chosen. Nothing is stored.
const TEMPLATES: Template[] = [
  { key: "xlsx", label: "Excel (.xlsx)" },
  { key: "csv", label: "CSV (.csv)" },
  { key: "docx", label: "Word (.docx)" },
  { key: "pdf", label: "PDF (.pdf)" },
  { key: "md", label: "Markdown (.md)" },
];

const BTN_CLASS =
  "rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50 disabled:cursor-not-allowed";

/** Downloads one template. */
async function download(key: Template["key"]): Promise<void> {
  if (key === "xlsx" || key === "csv") {
    const { downloadExamTemplate } = await import("@/lib/examImportFile");
    downloadExamTemplate(key);
    return;
  }
  const { downloadExamTemplateFile } = await import("@/lib/examImportRead");
  await downloadExamTemplateFile(key);
}

export default function TemplateMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = async (key: Template["key"]) => {
    setOpen(false);
    setBusy(true);
    setFailed(false);
    try {
      await download(key);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative inline-block" ref={ref}>
        <button type="button" disabled={busy} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={BTN_CLASS}>
          {busy ? "Preparing…" : "Download template ▾"}
        </button>
        {open && (
          <div role="menu" className="absolute bottom-full left-0 z-20 mb-1 w-48rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                role="menuitem"
                onClick={() => void choose(t.key)}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {failed && (
        <span role="alert" className="text-sm text-red-600 dark:text-red-400">
          The template could not be made. Try again.
        </span>
      )}
    </div>
  );
}
