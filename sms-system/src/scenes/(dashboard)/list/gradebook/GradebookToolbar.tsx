// The banners (shared gradebook, unsaved changes), the Save and "+ Column" buttons, the weight warning, and
// the messages for nothing chosen, loading and a failed load.
export function GradebookToolbar({
  allSelected,
  sharedTeacherNames,
  isDirty,
  showEditControls,
  performSave,
  canEdit,
  saving,
  isCompletedTerm,
  setShowColumnModal,
  showWeightWarning,
  weightTotal,
  saveError,
  loading,
  loadError,
}: {
  allSelected: boolean;
  sharedTeacherNames: string[];
  isDirty: boolean;
  showEditControls: boolean;
  performSave: () => Promise<void>;
  canEdit: boolean;
  saving: boolean;
  isCompletedTerm: boolean;
  setShowColumnModal: (open: boolean) => void;
  showWeightWarning: boolean;
  weightTotal: number;
  saveError: string | null;
  loading: boolean;
  loadError: string | null;
}) {
  return (
    <>
      {/* Banners */}
      {allSelected && sharedTeacherNames.length > 0 && (
        <div className="mb-3 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300">
          This gradebook is shared with {sharedTeacherNames.join(" and ")}.
        </div>
      )}
      {allSelected && isDirty && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300">
          You have unsaved changes. Click Save to persist, or navigate away to
          auto-save.
        </div>
      )}

      {/* Action controls */}
      {allSelected && showEditControls && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <button
            onClick={performSave}
            disabled={!canEdit || saving || !isDirty}
            title={isCompletedTerm ? "This term is completed." : undefined}
            className="px-4 py-1.5 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            id="tour-gradebook-add-column"
            onClick={() => setShowColumnModal(true)}
            disabled={!canEdit || saving}
            title={isCompletedTerm ? "This term is completed." : undefined}
            className="px-4 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            + Column
          </button>
          {showWeightWarning && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Column weights sum to {weightTotal}% (must equal 100% for report
              cards)
            </span>
          )}
        </div>
      )}

      {saveError && <p className="text-xs text-red-500 mb-3">{saveError}</p>}

      {/* Load state */}
      {!allSelected && (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-6">
          Select a term, class, and subject to load the gradebook.
        </p>
      )}
      {allSelected && loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-6">
          Loading…
        </p>
      )}
      {allSelected && loadError && (
        <p className="text-sm text-red-500 mt-6">{loadError}</p>
      )}
    </>
  );
}
