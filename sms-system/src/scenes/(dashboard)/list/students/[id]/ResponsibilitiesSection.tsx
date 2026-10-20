import type { Responsibility } from "@/lib/studentDetailLogic";

// The term's positions of responsibility, with (institution admin) removing and the add form.
export function ResponsibilitiesSection({
  responsibilities,
  mayEdit,
  handleDeleteResponsibility,
  responsibilityError,
  responsibilityTitle,
  setResponsibilityTitle,
  responsibilityOrg,
  setResponsibilityOrg,
  handleAddResponsibility,
  addingResponsibility,
}: {
  responsibilities: Responsibility[];
  mayEdit: boolean;
  handleDeleteResponsibility: (responsibilityId: string) => Promise<void>;
  responsibilityError: string | null;
  responsibilityTitle: string;
  setResponsibilityTitle: (title: string) => void;
  responsibilityOrg: string;
  setResponsibilityOrg: (organisation: string) => void;
  handleAddResponsibility: () => Promise<void>;
  addingResponsibility: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
      <h2 className="text-base font-semibold">
        Positions of Responsibility
      </h2>

      {responsibilities.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">
          No positions recorded for this term.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
          {responsibilities.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="text-gray-900 dark:text-gray-100">
                {r.title}
                {r.organisation ? ` — ${r.organisation}` : ""}
              </span>
              {mayEdit && (
                <button
                  onClick={() => handleDeleteResponsibility(r.id)}
                  className="text-red-500 hover:text-red-700 text-xs px-2 py-0.5 rounded border border-red-200 dark:border-red-800 hover:border-red-400"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {responsibilityError && (
        <p className="text-xs text-red-500">{responsibilityError}</p>
      )}

      {mayEdit && (
        <div className="flex flex-col gap-2 pt-1">
          <input
            type="text"
            autoComplete="off"
            value={responsibilityTitle}
            onChange={(e) => setResponsibilityTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddResponsibility();
            }}
            maxLength={100}
            placeholder="Title (e.g. Head Boy, Prefect)"
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
          />
          <div className="flex gap-2 items-center">
            <input
              type="text"
              autoComplete="off"
              value={responsibilityOrg}
              onChange={(e) => setResponsibilityOrg(e.target.value)}
              maxLength={100}
              placeholder="Organisation (optional)"
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
            />
            <button
              onClick={handleAddResponsibility}
              disabled={addingResponsibility || !responsibilityTitle.trim()}
              className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
            >
              {addingResponsibility ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
