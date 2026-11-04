import type { RubricCriterion, RubricDocument } from "@/types/assessment";

// A rubric's grid as plain rows of text, the form every generated download starts from
// (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 9). Pure, with no libraries.

export type RubricGrid = Pick<
  RubricDocument,
  "title" | "description" | "criteria"
>;

const levelKey = (c: RubricCriterion) =>
  JSON.stringify(c.levels.map((l) => [l.label, l.points]));

/**
 * The grid as rows of text, one row per criterion, with the header first. When every criterion has the same levels, the columns
 * are those levels, such as "Excellent (4)". Otherwise they are numbered, and each cell names its own level.
 */
export function rubricToTable(
  rubric: Pick<RubricGrid, "criteria">,
): string[][] {
  const { criteria } = rubric;
  const shared =
    criteria.length > 0 &&
    criteria.every((c) => levelKey(c) === levelKey(criteria[0]));
  const columns = Math.max(0, ...criteria.map((c) => c.levels.length));
  const header = shared
    ? criteria[0].levels.map((l) => `${l.label} (${l.points})`)
    : Array.from({ length: columns }, (_, i) => `Level ${i + 1}`);
  const rows = criteria.map((c) => {
    const cells = c.levels.map((l) => {
      const description = l.description ?? "";
      if (shared) return description;
      return description
        ? `${l.label} (${l.points}): ${description}`
        : `${l.label} (${l.points})`;
    });
    const padding = Array.from({ length: columns - cells.length }, () => "");
    return [c.name, String(c.maxPoints), ...cells, ...padding];
  });
  return [["Criterion", "Max points", ...header], ...rows];
}

const markdownCell = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ");

/** The rubric as a Markdown file: its title, its description, and one pipe table. */
export function rubricToMarkdown(rubric: RubricGrid): string {
  const [header, ...rows] = rubricToTable(rubric);
  const line = (cells: string[]) =>
    `| ${cells.map(markdownCell).join(" | ")} |`;
  return [
    `# ${rubric.title}`,
    ...(rubric.description ? ["", rubric.description] : []),
    "",
    line(header),
    line(header.map(() => "---")),
    ...rows.map(line),
    "",
  ].join("\n");
}

/** A safe file name from the title. "Oral: Term 1/2" becomes "Oral-Term-1-2". */
export function rubricFileBase(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100);
  return base || "rubric";
}
