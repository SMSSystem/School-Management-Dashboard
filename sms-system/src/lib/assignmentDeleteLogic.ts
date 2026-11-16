// The pure half of deleting an assignment: what the confirmation says. No Firebase import, so it is unit-tested
// directly; assignmentDelete.ts does the reads and writes.

/** What the confirmation counts: the students' submissions that go with the assignment, and the grades that stay. */
export type AssignmentDeleteCounts = { submissions: number; results: number };

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** The dialog's sentence about what goes with the assignment, and what stays. */
export function assignmentDeleteWarning(c: AssignmentDeleteCounts): string {
  const goes =
    c.submissions > 0
      ? `${plural(c.submissions, "student's submission", "students' submissions")}, with every attempt and file, will be deleted too.`
      : "No student has submitted work for it.";
  const stays =
    c.results > 0
      ? ` ${plural(c.results, "grade")} already given ${c.results === 1 ? "stays" : "stay"} in Results and the gradebook.`
      : "";
  return `${goes}${stays}`;
}
