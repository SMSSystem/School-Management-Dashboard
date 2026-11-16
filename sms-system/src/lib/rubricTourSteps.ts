import type { Step } from "nextstepjs";
import type { Role } from "@/types/people";

// The Rubrics page's tour (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 15.2). It is started by the page's
// "Take a tour" button, never by itself, and it never opens a dialog or asks anyone to act, so it needs no route changes or
// validation gates. Only things that are always on the page are targeted; the rest are centred, because a school with no
// rubrics has no rows. A read-only account sees the steps about viewing only, with its own wording.

const step = (
  title: string,
  content: string,
  selector?: string,
  side: Step["side"] = "bottom",
): Step => ({
  icon: null,
  title,
  content,
  ...(selector && { selector, side, viewportID: "main-viewport" }),
  showControls: true,
  showSkip: true,
});

const INTRO = step(
  "Rubrics",
  "Rubrics are a shared library for your school. Attach one to an assignment so students and parents can see how the work will be marked.",
);

const LIBRARY = step(
  "The library",
  "Search by title or description, or filter by type. The Type column shows whether a rubric has a grid, an uploaded file, or both. The eye icon opens a rubric one criterion at a time: use the arrows, the list, the arrow keys, or swipe on a phone.",
  "#tour-rubrics-table",
  "top",
);

const ROW_ACTIONS: Record<"admin" | "teacher" | "viewer", Step> = {
  admin: step(
    "Row actions",
    "Each row lets you view, download, edit, replace or remove a file, and delete. As an administrator you can change or delete any rubric.",
  ),
  teacher: step(
    "Row actions",
    "Each row lets you view, download and edit. Any teacher can edit a grid, but only the person who uploaded a file, or an administrator, can replace or remove it. You can delete a rubric you uploaded.",
  ),
  viewer: step(
    "Viewing rubrics",
    "You can open any rubric to read it. Downloads aren't available on this account.",
  ),
};

const AUTHORING: Step[] = [
  step(
    "Upload a rubric",
    "Upload an Excel, CSV, Word, PDF or Markdown file of up to 500 KB. Check it holds no student names, marks or answer keys first. If the app can read a grid from it, only the grid is kept; otherwise the file is kept and students and parents can download it as it is.",
    "#tour-rubrics-upload",
  ),
  step(
    "Start from a template",
    "Download a template and fill it in. A file in the template's layout, or in one of the other common rubric layouts (including a PDF with real text), is read into a grid that students can step through.",
    "#tour-rubrics-templates",
  ),
  step(
    "Review what was read",
    "When a grid is found in a file, you check and correct it before saving. If no grid can be read, the file is kept on its own, and you can add a grid later through Edit.",
  ),
  step(
    "Or type a grid",
    "Use the + button to type a rubric's criteria and levels yourself.",
    "#tour-rubrics-add",
  ),
];

const ATTACH = step(
  "Attach it to an assignment",
  "Choose a rubric when you create or edit an assignment. Students and parents see it on the assignment's page, and can download a copy there.",
);

/** The steps for this person's role. */
export function rubricTourSteps(role: Role | null | undefined): Step[] {
  if (role === "spectator") return [INTRO, LIBRARY, ROW_ACTIONS.viewer];
  const actions =
    role === "institution_admin" ? ROW_ACTIONS.admin : ROW_ACTIONS.teacher;
  return [INTRO, ...AUTHORING, LIBRARY, actions, ATTACH];
}
