import type { SessionMissing } from "@/lib/attendanceMissing";

// The students a register session is still missing a state for, by name (A-Z),
// grouped by session. Shown in the "save anyway?" dialogs so a teacher can see
// exactly who would be left out of the attendance totals. Scrolls inside the
// dialog, so a big class never makes it taller than the screen.
const MissingStudentsList = ({ groups }: { groups: SessionMissing[] }) => {
  if (groups.length === 0) return null;
  return (
    <div
      className="mb-4 max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 p-2 text-xs text-gray-600 dark:text-gray-300 space-y-2"
      data-testid="missing-students"
    >
      {groups.map((g) => (
        <div key={g.label}>
          <p className="font-semibold text-gray-800 dark:text-gray-100">
            {g.label} <span className="font-normal text-gray-500 dark:text-gray-400">({g.names.length})</span>
          </p>
          <ul className="list-disc list-inside">
            {g.names.map((n, i) => (
              <li key={`${n}-${i}`}>{n}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default MissingStudentsList;
