import type { Activity } from "@/lib/studentDetailLogic";

// The term's extra curricular activities, with (institution admin) removing and the add form.
export function ActivitiesSection({
  activities,
  mayEdit,
  handleDeleteActivity,
  activityError,
  activityName,
  setActivityName,
  handleAddActivity,
  addingActivity,
}: {
  activities: Activity[];
  mayEdit: boolean;
  handleDeleteActivity: (activityId: string) => Promise<void>;
  activityError: string | null;
  activityName: string;
  setActivityName: (name: string) => void;
  handleAddActivity: () => Promise<void>;
  addingActivity: boolean;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
      <h2 className="text-base font-semibold">
        Extra Curricular Activities
      </h2>

      {activities.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">
          No activities recorded for this term.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
          {activities.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="text-gray-900 dark:text-gray-100">
                {a.activityName}
              </span>
              {mayEdit && (
                <button
                  onClick={() => handleDeleteActivity(a.id)}
                  className="text-red-500 hover:text-red-700 text-xs px-2 py-0.5 rounded border border-red-200 dark:border-red-800 hover:border-red-400"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {activityError && (
        <p className="text-xs text-red-500">{activityError}</p>
      )}

      {mayEdit && (
        <div className="flex gap-2 items-center pt-1">
          <input
            type="text"
            autoComplete="off"
            value={activityName}
            onChange={(e) => setActivityName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddActivity();
            }}
            maxLength={100}
            placeholder="e.g. Football, Drama Club"
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
          />
          <button
            onClick={handleAddActivity}
            disabled={addingActivity || !activityName.trim()}
            className="bg-sky-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
          >
            {addingActivity ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
