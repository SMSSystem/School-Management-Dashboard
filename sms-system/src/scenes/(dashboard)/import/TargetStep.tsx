import { IMPLEMENTED_TARGETS, PLANNED_TARGETS, TARGET_ALLOWED_ROLES, type TargetKey } from "@/lib/importConfig";
import type { Role } from "@/types/people";

// The first step: the kinds of data this role may import.
export function TargetStep({
  role,
  busy,
  selectTarget,
}: {
  role: Role | null;
  busy: boolean;
  selectTarget: (key: TargetKey) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base text-gray-500 dark:text-gray-400 mb-1">
        Choose which kind of data you want to bulk-import from a spreadsheet.
      </p>
      {IMPLEMENTED_TARGETS.filter((t) => role && TARGET_ALLOWED_ROLES[t.key].includes(role)).map((t) => (
        <button
          key={t.key}
          type="button"
          disabled={busy}
          className="text-left ring-[1.5px] ring-gray-300 dark:ring-gray-600 rounded-md p-3 text-base hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          onClick={() => void selectTarget(t.key)}
        >
          {t.label}
        </button>
      ))}
      {PLANNED_TARGETS.map((label) => (
        <div
          key={label}
          className="text-left ring-[1.5px] ring-gray-200 dark:ring-gray-700 rounded-md p-3 text-base text-gray-400 dark:text-gray-600"
        >
          {label} <span className="text-sm">(coming soon)</span>
        </div>
      ))}
    </div>
  );
}
