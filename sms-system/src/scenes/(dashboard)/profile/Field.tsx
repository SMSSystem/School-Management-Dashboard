import { readOnlyClassName } from "./styles";

// A label with a read-only value under it.
const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {label}
    </span>
    <p className={readOnlyClassName}>{value || "—"}</p>
  </div>
);

export default Field;
