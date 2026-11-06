import { titleFromFileName } from "./rubricFileKinds";

// The title choices for a rubric read from a file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md D23): the heading above its
// table or its sheet's name, the file's name (numbered when the file holds several rubrics), or a title the teacher types. It
// starts on the heading when there is one. Pure.

export type TitleChoice = "heading" | "file" | "typed";
export type TitleState = { choice: TitleChoice; typed: string };

const MAX_TITLE = 150;
const tidy = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);

/** The file-name choice: "Project rubric", or "Project rubric 2" when the file holds several. */
export function fileTitle(
  fileName: string,
  index: number,
  count: number,
): string {
  const base = titleFromFileName(fileName) || "Rubric";
  return tidy(count > 1 ? `${base} ${index + 1}` : base);
}

export const initialTitle = (heading: string): TitleState => ({
  choice: tidy(heading) ? "heading" : "file",
  typed: "",
});

/** The title the chosen option gives. Empty only when the teacher chose to type and hasn't. */
export function resolveTitle(
  state: TitleState,
  heading: string,
  fromFile: string,
): string {
  if (state.choice === "typed") return tidy(state.typed);
  if (state.choice === "heading" && tidy(heading)) return tidy(heading);
  return tidy(fromFile);
}

/** One rubric waiting for review: which of those found, and its title. */
export type Queued = { index: number; title: string };

/**
 * The rubrics to review, in order, from what the teacher ticked and chose as titles. An error when none is ticked or a ticked one
 * has no title, so the review never starts with something it can't save.
 */
export function queueFromPicks(
  picks: readonly { include: boolean; title: TitleState }[],
  headings: readonly string[],
  fileName: string,
): { queue: Queued[] } | { error: string } {
  const queue = picks.flatMap((pick, index) =>
    pick.include
      ? [
          {
            index,
            title: resolveTitle(
              pick.title,
              headings[index] ?? "",
              fileTitle(fileName, index, picks.length),
            ),
          },
        ]
      : [],
  );
  if (queue.length === 0)
    return { error: "Choose at least one rubric to keep." };
  if (queue.some((q) => !q.title))
    return { error: "Every rubric you keep needs a title." };
  return { queue };
}
