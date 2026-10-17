import type { ReactNode } from "react";
import { formatGenderBreakdown, type GenderCounts } from "@/lib/classPopulation";

// A head-count with its Male/Female split. A device that can hover (mouse, trackpad) gets the split as
// a tooltip on the count; a touch device, which cannot open a tooltip, gets it as a small line under
// the count (`@media (hover: none)`, so a touch tablet is treated as touch whatever its width and a
// touch laptop with a mouse as hover). `alwaysVisible` shows the line on every device, for the places
// that have no room for a column (the Classes list on a phone). Screen readers always get the full
// wording ("12 male, 12 female"), whichever way it is shown.
type Props = {
  counts: GenderCounts;
  /** The count itself, for example "24 of 30". */
  children?: ReactNode;
  alwaysVisible?: boolean;
  /** Said before the split in the tooltip, for example "Over capacity". */
  note?: string;
};

export default function GenderBreakdown({ counts, children, alwaysVisible = false, note }: Props) {
  const full = formatGenderBreakdown(counts, "full");
  const short = formatGenderBreakdown(counts, "short");
  return (
    <span className="inline-flex flex-col" title={note ? `${note} — ${full}` : full}>
      {children}
      <span
        aria-hidden="true"
        className={`${alwaysVisible ? "block" : "hidden [@media(hover:none)]:block"} text-xs font-normal text-gray-500 dark:text-gray-400`}
      >
        {short}
      </span>
      <span className="sr-only">{full}</span>
    </span>
  );
}
