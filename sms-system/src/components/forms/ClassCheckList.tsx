// A scrollable checkbox list of classes, for a form that lets the person pick several (a subject's classes, a lesson
// note's classes). The parent owns the selection.
export default function ClassCheckList({
  classes,
  selectedIds,
  onToggle,
  emptyText = "No classes found.",
}: {
  classes: { id: string; name: string }[];
  selectedIds: readonly string[];
  onToggle: (id: string, name: string) => void;
  emptyText?: string;
}) {
  return (
    <div className="ring-[1.5px] ring-gray-300 rounded-md p-2 max-h-40 overflow-y-auto dark:ring-gray-600 dark:bg-gray-900">
      {classes.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyText}</p>
      ) : (
        classes.map((cls) => (
          <label key={cls.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.includes(cls.id)}
              onChange={() => onToggle(cls.id, cls.name)}
            />
            {cls.name}
          </label>
        ))
      )}
    </div>
  );
}
