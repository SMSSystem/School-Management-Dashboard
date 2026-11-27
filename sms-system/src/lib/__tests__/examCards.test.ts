import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { flat } from "./sourceText";
import ExamCard from "../../components/exam/ExamCard";
import pageRaw from "../../scenes/(dashboard)/list/exams/index.tsx?raw";
import actionsRaw from "../../components/exam/ExamRowActions.tsx?raw";
import modalRaw from "../../components/FormModal.tsx?raw";

// The staff Exams list as cards on a phone: what a card says, that the buttons are 44 px on it and nothing else changes size,
// and how the page hands the cards to the table.

const norm = (s: string) => s.split("\r\n").join("\n");
const page = norm(pageRaw);
const actions = norm(actionsRaw);
const modal = norm(modalRaw);

const card = (over: Partial<Parameters<typeof ExamCard>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ExamCard, {
      title: "Unit 3 Quiz",
      online: true,
      subject: "Maths",
      className: "3A",
      typeLabel: "Quiz",
      teacher: "Ada Brown",
      dateText: "October 27, 2026 · 9:00 AM",
      status: "Draft",
      statusClass: "bg-amber-100",
      actions: createElement("button", null, "the buttons"),
      ...over,
    }),
  );

describe("a card", () => {
  it("is a list item with every fact of the table row", () => {
    const html = card();
    expect(html.startsWith("<li ")).toBe(true);
    for (const fact of [
      "Unit 3 Quiz",
      "Maths",
      "3A",
      "Quiz",
      "Ada Brown",
      "October 27, 2026 · 9:00 AM",
      "Draft",
    ])
      expect(html).toContain(fact);
    expect(html).toContain("the buttons");
  });

  it("has the Online badge only for an online exam", () => {
    expect(card()).toContain(">Online</span>");
    expect(card({ online: false })).not.toContain("Online");
  });

  it("shows the subject under a title only when it is given", () => {
    expect(card({ subject: undefined })).not.toContain("Maths");
  });

  it("says a dash for a missing type, leaves the teacher out when unknown, and has no status chip for a timetable-only exam", () => {
    const html = card({
      typeLabel: "",
      teacher: "",
      status: null,
      statusClass: "",
    });
    expect(html).toContain("3A · —");
    expect(html).not.toContain(" · October");
    expect(html).not.toContain("Draft");
    expect(html).toContain(">—</span>");
  });

  it("wraps its actions, so a row of 44 px buttons never runs off a narrow screen", () => {
    expect(card()).toContain("flex flex-wrap items-center gap-2");
  });

  it("has the dark-mode pairs of the student’s cards", () => {
    const html = card();
    expect(html).toContain("ring-gray-200 dark:ring-gray-700");
    expect(html).toContain("dark:text-gray-400");
  });
});

describe("the size of the buttons", () => {
  it("is 44 px on a card and what it always was elsewhere", () => {
    expect(actions).toContain(
      'touch ? "flex h-11 w-11 items-center justify-center rounded-full" : LINK_CLS',
    );
    expect(actions.match(/className=\{linkCls\}/g)).toHaveLength(3);
    expect(actions).toContain("touch={touch}");
    expect(flat(modal)).toContain(
      flat(
        'props.touch ? "w-11 h-11" : type === "create" && !look.triggerIcon ? "w-8 h-8" : "w-7 h-7"',
      ),
    );
  });
});

describe("the page", () => {
  it("hands the table a card for a phone, with the buttons made for a finger, and keeps the row as it was", () => {
    expect(page).toContain("renderCard={renderCard}");
    expect(page).toContain("actions={rowActions(item, true)}");
    expect(page).toContain("{rowActions(item, false)}");
  });

  it("gives the card the same facts the row has, from the same helpers", () => {
    expect(page).toContain("title={info.title}");
    expect(page).toContain("online={info.online}");
    expect(page).toContain("typeLabel={info.typeLabel}");
    expect(page).toContain("teacher={item.teacherName}");
    expect(page).toContain("dateText={dateOf(item)}");
    expect(page).toContain("status={info.status}");
    expect(page).toContain(
      "subject={item.title && item.subjectName ? item.subjectName : undefined}",
    );
  });

  it("shows Edit and Delete to the same roles in the row and the card", () => {
    const src = flat(page);
    expect(src).toContain(
      flat(
        'const canEdit = role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher";',
      ),
    );
    expect(src).toContain(
      flat(
        'const canDelete = role === "institution_admin" || role === "super_admin";',
      ),
    );
    expect(src).toContain(
      flat('{canEdit && <FormModal table="exam" type="update"'),
    );
    expect(src).toContain(
      flat('{canDelete && <FormModal table="exam" type="delete"'),
    );
  });

  it("leaves the student’s and the parent’s list alone", () => {
    expect(flat(page)).toContain(
      flat(
        "<StudentExamList exams={studentSide.exams} loading={studentSide.loading} />",
      ),
    );
    expect(page.indexOf('audience === "student_parent"')).toBeLessThan(
      page.indexOf("const renderCard"),
    );
  });
});
