import { useState } from "react";
import { FileDown } from "lucide-react";
import DialogShell from "@/components/DialogShell";
import type { RubricTemplateFormat } from "@/lib/rubricTemplate";

const OPTIONS: { format: RubricTemplateFormat; label: string }[] = [
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "csv", label: "CSV (.csv)" },
  { format: "docx", label: "Word (.docx)" },
  { format: "md", label: "Markdown (.md)" },
];
const OPTION_CLS =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700";

// The template teachers can fill in and upload (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 8), on the Rubrics page
// only (D6). It is built in the browser when a format is chosen, so this page doesn't carry the spreadsheet library.
function TemplateChoices({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const choose = async (format: RubricTemplateFormat) => {
    setBusy(true);
    setFailed(false);
    try {
      const { downloadRubricTemplate } = await import("@/lib/rubricTemplate");
      await downloadRubricTemplate(format);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <DialogShell title="Download a template" onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300">
        <p>
          One row for each criterion, and one column for each level. Replace the
          examples with your own. You can add, remove or rename level columns,
          as long as each keeps its points in brackets, such as Excellent (4).
        </p>
        <p>Keep the file under 500 KB, and don't include student names.</p>
      </div>
      <div className="flex flex-col gap-2">
        {OPTIONS.map(({ format, label }) => (
          <button
            key={format}
            type="button"
            disabled={busy}
            onClick={() => void choose(format)}
            className={OPTION_CLS}
          >
            {label}
          </button>
        ))}
      </div>
      {failed && (
        <p role="alert" className="text-xs text-red-500">
          The template could not be made. Please try again.
        </p>
      )}
    </DialogShell>
  );
}

/** The button on the Rubrics page, with its dialog. */
export default function RubricTemplateMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        id="tour-rubrics-templates"
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <FileDown className="h-4 w-4" aria-hidden="true" />
        Download Template
      </button>
      {open && <TemplateChoices onClose={() => setOpen(false)} />}
    </>
  );
}
