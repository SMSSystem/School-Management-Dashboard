import { useId } from "react";
import { SECTION_GRID_CLS } from "./examFormStyles";

// A titled group of fields in the exam form: a small uppercase heading and the fields in a grid. `panel` tints the
// group (the online settings), so it stands apart from the schedule fields above it.
export default function FormSection({
  title,
  panel = false,
  children,
}: {
  title: string;
  panel?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={panel ? "rounded-md border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900 dark:bg-sky-900/10" : ""}
    >
      <h2 id={id} className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      <div className={SECTION_GRID_CLS}>{children}</div>
    </section>
  );
}
