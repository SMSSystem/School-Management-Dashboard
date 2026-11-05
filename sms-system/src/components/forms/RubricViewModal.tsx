import { useState } from "react";
import { Eye } from "lucide-react";
import DialogShell from "@/components/DialogShell";
import RubricCarousel from "@/components/rubric/RubricCarousel";
import RubricFileDetails from "@/components/rubric/RubricFileDetails";
import type { RubricDocument } from "@/lib/firebase";
import { isFileOnly } from "@/lib/rubricFileKinds";

type Rubric = RubricDocument & { id: string };

// Standalone — deliberately not threaded through FormModal.tsx's type system. FormModal's form registry
// (formRegistry.tsx) and its "create" | "update" | "delete" union both assume an editable-form shape; this is read-only.
// The criteria are a carousel (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 6), so a long rubric needs no
// long scroll, and DialogShell gives the dialog its role, Escape, and the focus handling. It is opened only from the Rubrics
// page, so its readers are staff. A rubric that holds only a file has nothing to show here but the file's details.
const RubricViewModal = ({ rubric }: { rubric: Rubric }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="w-7 h-7 flex items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        onClick={() => setOpen(true)}
        title={`View ${rubric.title}`}
        aria-label={`View ${rubric.title}`}
      >
        <Eye className="w-4 h-4 text-white" />
      </button>

      {open && (
        <DialogShell title={rubric.title} onClose={() => setOpen(false)} card>
          {rubric.description && (
            <p className="text-sm text-slate-500 dark:text-gray-400">
              {rubric.description}
            </p>
          )}
          <RubricFileDetails rubric={rubric} staff />
          {isFileOnly(rubric) ? (
            <p className="text-sm italic text-gray-400">
              This rubric was uploaded as a file, so it has no criteria to show
              here.
            </p>
          ) : (
            <RubricCarousel
              criteria={rubric.criteria}
              label={`${rubric.title} criteria`}
            />
          )}
        </DialogShell>
      )}
    </>
  );
};

export default RubricViewModal;
