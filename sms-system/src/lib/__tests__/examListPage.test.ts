import { describe, expect, it } from "vitest";
import { flat } from "./sourceText";
import pageRaw from "../../scenes/(dashboard)/list/exams/index.tsx?raw";

// The Exams list (EXAMS_FEATURE_SPEC.md §4.7): an exam column with the title and an Online badge, a type column and
// a status column. The status comes from examRowInfo, which gives students and parents only Scheduled, Open or Closed.

const page = pageRaw.split("\r\n").join("\n");

describe("the Exams list page", () => {
  it("shows the exam, class, type, teacher, date, status and actions columns, with the small ones hidden on a narrow screen", () => {
    const headers = [...page.matchAll(/header: "([^"]+)"/g)].map((m) => m[1]);
    expect(headers).toEqual([
      "Exam",
      "Class",
      "Type",
      "Teacher",
      "Date",
      "Status",
      "Actions",
    ]);
    const columnOf = (accessor: string) =>
      page.slice(
        page.indexOf(`accessor: "${accessor}"`),
        page.indexOf("},", page.indexOf(`accessor: "${accessor}"`)),
      );
    expect(columnOf("status")).toContain("hidden md:table-cell");
    // Type, Teacher and Date wait for lg, so the table next to the sidebar is not squeezed.
    for (const accessor of ["type", "teacher", "date"])
      expect(columnOf(accessor), accessor).toContain("hidden lg:table-cell");
  });

  it("wraps the action buttons of a row", () => {
    expect(flat(page)).toContain(
      flat(
        '<div className="flex flex-wrap items-center gap-2 py-2">{rowActions(item, false)}</div>',
      ),
    );
  });

  it("takes the title, type and status from examRowInfo, with the audience of the signed-in role", () => {
    expect(page).toContain("examRowInfo(item, nowMs, audience)");
    expect(page).toContain(
      'role === "student" || role === "parent" ? "student_parent" : "staff"',
    );
    expect(page).toContain("{info.title}");
    expect(page).toContain('{info.typeLabel || "—"}');
    expect(page).toContain("{info.status}");
  });

  it("marks an online exam with a badge and keeps the subject under a title", () => {
    expect(page).toContain("info.online && (");
    expect(flat(page)).toContain(">Online</span>");
    expect(page).toContain("item.title && item.subjectName");
  });

  it("keeps the shared listener, the role-checked buttons and the table", () => {
    expect(flat(page)).toContain("subscribeSnapshot(`exams:${institutionId}`");
    const src = flat(page);
    expect(src).toContain(flat('<FormModal table="exam" type="create" />'));
    expect(src).toContain(
      flat(
        '<FormModal table="exam" type="delete" id={item.id} data={item as unknown as FormData} touch={touch} />',
      ),
    );
    expect(src).toContain("<Table columns={columns}");
  });
});
