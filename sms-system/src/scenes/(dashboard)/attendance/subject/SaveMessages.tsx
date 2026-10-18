// The messages below the Save buttons: the saved notice, and the save error with its "Save anyway" link.
export function SaveMessages({
  saveSuccess,
  saveError,
  saveAttempted,
  setConfirmDialogOpen,
}: {
  saveSuccess: string | null;
  saveError: string | null;
  saveAttempted: boolean;
  setConfirmDialogOpen: (open: boolean) => void;
}) {
  return (
    <>
    {saveSuccess && (
      <div className="mt-3 rounded-md bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-300">
        {saveSuccess}
      </div>
    )}
    {saveError && (
      <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
        {saveError}
        {saveAttempted && (
          <button
            type="button"
            className="ml-2 underline font-medium"
            onClick={() => setConfirmDialogOpen(true)}
          >
            Save anyway
          </button>
        )}
      </div>
    )}
    </>
  );
}
