import { ALL } from "./listFilters";
import { rubricTypeLabel } from "./rubricFileKinds";
import type { RubricDocument } from "@/types/assessment";

// The Rubrics page's search and Type filter (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md item 2.11). Both work on the list
// the page already holds, so filtering costs no Firestore reads. Pure.

/** The Type filter's choices, in the words of the Type column. */
export const RUBRIC_TYPE_OPTIONS = ["Grid", "Grid + file", "File only"].map(
  (label) => ({ value: label, label }),
);

type Listed = Pick<
  RubricDocument,
  "title" | "description" | "criteria" | "file"
>;

const normalise = (text: string) =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

/** The rubrics whose title or description holds the search, and whose type is the one chosen (ALL for any). */
export function filterRubrics<T extends Listed>(
  rubrics: readonly T[],
  filter: { search: string; type: string },
): T[] {
  const words = normalise(filter.search).split(" ").filter(Boolean);
  return rubrics.filter((rubric) => {
    if (filter.type !== ALL && rubricTypeLabel(rubric) !== filter.type)
      return false;
    const text = normalise(`${rubric.title} ${rubric.description ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}
