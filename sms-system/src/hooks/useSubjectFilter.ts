import { useMemo, useState } from "react";
import {
  getPersistedFilter,
  setPersistedFilter,
} from "@/lib/filterPersistence";
import { naturalCompare } from "@/lib/sortByName";

/**
 * The Subject dropdown and subject chips of a list page (Lesson Notes, Assignments, Exams): one shared value,
 * remembered for the browser session under `page` (lib/filterPersistence.ts). Filtering is client-side over the
 * rows the page already loaded, so it costs no reads.
 *  - subjects: the distinct subject names among the rows, in natural order;
 *  - hasSubjectFilter: the filter shows only with two or more subjects to choose between;
 *  - activeSubject: the chosen subject, or "" (All) when it has since disappeared from the rows, or when the
 *    filter is not shown (a remembered choice never narrows a list that has no control to undo it).
 */
export function useSubjectFilter(page: string, names: readonly string[]) {
  const [subject, setSubjectState] = useState(() =>
    getPersistedFilter(page, "subject"),
  );
  const setSubject = (value: string) => {
    setSubjectState(value);
    setPersistedFilter(page, "subject", value);
  };
  // Keyed on the names' text, since the page hands in a new array on every render.
  const key = names.join("\u0000");
  const subjects = useMemo(
    () =>
      [...new Set(key.split("\u0000").filter(Boolean))].sort(naturalCompare),
    [key],
  );
  const hasSubjectFilter = subjects.length > 1;
  const activeSubject =
    hasSubjectFilter && subjects.includes(subject) ? subject : "";
  return { subjects, hasSubjectFilter, activeSubject, setSubject };
}
