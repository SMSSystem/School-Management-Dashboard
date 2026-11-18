import type { additionalClassRows } from "@/lib/studentDetailLogic";

// The Additional Classes card, under the student card: the classes the student is in besides their home class,
// each with the subjects they take there. Nothing at all when there are none.
export function AdditionalClassesSection({
  rows,
}: {
  rows: ReturnType<typeof additionalClassRows>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex flex-col gap-3">
      <h2 className="text-base font-semibold">Additional Classes</h2>
      <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <span className="font-medium text-gray-800 dark:text-gray-100">
              {row.name}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {row.subjects}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
