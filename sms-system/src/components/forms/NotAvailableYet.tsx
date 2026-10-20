// What the Add/Edit dialogs of features that are not built yet show: a short explanation and a Close button,
// with no fields, so nothing looks saveable. (The Events, Announcements and Lessons forms used to be complete-looking
// forms that logged what was typed to the console and closed, and nothing in the app ever wrote those collections.)

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function NotAvailableYet({ what, onClose }: { what: string; onClose?: () => void }) {
  return (
    <div className="flex flex-col gap-4 p-2" role="status">
      <h1 className="text-xl font-semibold">{capitalise(what)} are not available yet</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Creating and editing {what} is not built yet. Nothing you enter here would be saved.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="self-start px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm rounded-md transition-colors"
      >
        Close
      </button>
    </div>
  );
}

/** The line above a list page whose records cannot be created yet. */
export function NotAvailableNote({ what }: { what: string }) {
  return (
    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
      {capitalise(what)} cannot be created yet, so this list stays empty.
    </p>
  );
}
