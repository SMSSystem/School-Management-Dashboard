import { useState } from "react";
import { Eye, Rows3, X } from "lucide-react";
import type { RubricDocument } from "@/lib/firebase";

type Rubric = RubricDocument & { id: string };

// Standalone — deliberately not threaded through FormModal.tsx's type system
// (the post-merge dev-notes plan, not kept in the repository). FormModal's form registry (formRegistry.tsx)
// and its "create" | "update" | "delete" union both assume an editable-form
// shape; this is read-only and styled to match (auth)/change-password/
// index.tsx's card language (rounded-2xl, shadow-xl, centered icon header)
// rather than FormModal's plain bg-white rounded-md shell — reusing that
// shell would have meant adding a conditional-styling branch to it for this
// one case alone.
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl px-8 py-10 sm:px-10">
            <button
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 transition-colors"
              onClick={() => setOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex justify-center mb-7">
              <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 flex items-center justify-center">
                <Rows3 className="w-7 h-7 text-slate-400 dark:text-gray-300" />
              </div>
            </div>

            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-100 leading-tight mb-1.5">
                {rubric.title}
              </h1>
              {rubric.description && (
                <p className="text-slate-500 dark:text-gray-400 text-sm">{rubric.description}</p>
              )}
            </div>

            <div className="flex flex-col gap-5">
              {rubric.criteria.map((criterion) => (
                <div
                  key={criterion.id}
                  className="rounded-lg border border-slate-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                      {criterion.name}
                    </h3>
                    <span className="text-xs font-medium text-slate-500 dark:text-gray-400">
                      {criterion.maxPoints} pt{criterion.maxPoints === 1 ? "" : "s"} max
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {criterion.levels.map((level, i) => (
                      <div
                        key={i}
                        className="flex flex-col gap-0.5 rounded-md bg-slate-50 dark:bg-gray-900/40 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-slate-800 dark:text-gray-200">
                            {level.label}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-gray-400 shrink-0">
                            {level.points} pt{level.points === 1 ? "" : "s"}
                          </span>
                        </div>
                        {level.description && (
                          <p className="text-xs text-slate-500 dark:text-gray-400">
                            {level.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RubricViewModal;
