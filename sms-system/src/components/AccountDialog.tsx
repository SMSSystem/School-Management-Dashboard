import type { ReactNode } from "react";
import { X } from "lucide-react";

// The confirm dialog of the three account buttons (Deactivate / Reactivate, Clear sign-in session, Delete): the dark
// overlay, the card, the Close X and the heading. The body goes in `children`; AccountDialogActions closes it with the
// error line and the Cancel / confirm buttons.
export function AccountDialog({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md relative w-full max-w-md flex flex-col gap-4">
        <button
          type="button"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
          onClick={onClose}
          title="Close"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold pr-8">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// The error line (when there is one) and the button row: Cancel, then the page's own confirm button (`children`).
export function AccountDialogActions({
  error,
  onCancel,
  cancelDisabled,
  children,
}: {
  error: string | null;
  onCancel: () => void;
  cancelDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          className="py-2 px-4 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
          disabled={cancelDisabled}
          onClick={onCancel}
        >
          Cancel
        </button>
        {children}
      </div>
    </>
  );
}
