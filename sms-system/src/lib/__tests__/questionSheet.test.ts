import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { flat } from "./sourceText";
import QuestionSheet from "../../components/exam/take/QuestionSheet";
import sheetRaw from "../../components/exam/take/QuestionSheet.tsx?raw";
import screenRaw from "../../components/exam/take/ExamAttemptScreen.tsx?raw";
import shellRaw from "../../components/DialogShell.tsx?raw";
import type { NavigatorItem } from "../examTakeLogic";

// The list of questions as a sheet in the carousel layout: what it says, which buttons are on, and that it is only an
// overlay inside the page.

const norm = (s: string) => s.split("\r\n").join("\n");
const sheet = norm(sheetRaw);
const screen = norm(screenRaw);
const shell = norm(shellRaw);
const noop = () => undefined;

const items: NavigatorItem[] = [
  { id: "q1", number: 1, answered: true, flagged: false },
  { id: "q2", number: 2, answered: false, flagged: true },
  { id: "q3", number: 3, answered: false, flagged: false },
  { id: "q4", number: 4, answered: true, flagged: true },
];

const render = (over: Partial<Parameters<typeof QuestionSheet>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(QuestionSheet, {
      items,
      currentId: "q2",
      forwardOnly: false,
      timeUp: false,
      unanswered: 2,
      onSelect: noop,
      onSubmit: noop,
      onClose: noop,
      ...over,
    }),
  );

describe("what the sheet says", () => {
  it("is a modal dialog called Questions that rises from the bottom", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(">Questions</h2>");
    expect(html).toContain("items-end");
    expect(html).toContain("rounded-t-xl");
    expect(html).toContain("max-h-[85dvh]");
  });

  it("counts the answered and flagged questions", () => {
    expect(render()).toContain("2 of 4 answered · 2 flagged");
    expect(
      render({
        items: items.map((i) => ({ ...i, flagged: false })),
        unanswered: 2,
      }),
    ).toContain("2 of 4 answered</p>");
  });

  it("says what the numbers mean in words, not only in colour", () => {
    const html = render();
    for (const word of ["Answered", "Not answered", "Flagged", "This question"])
      expect(html).toContain(word);
    expect(html).toContain('aria-label="What the numbers mean"');
  });

  it("has a button for every question, in 44 px size, with the state spoken, and marks the current one", () => {
    const html = render();
    expect(html).toContain('aria-label="Question 1, answered"');
    expect(html).toContain(
      'aria-label="Question 2, not answered, flagged" aria-current="true"',
    );
    expect(html).toContain('aria-label="Question 4, answered, flagged"');
    // Four numbers and the dialog's close button, which has a 44 px target too.
    expect(html.match(/h-11 w-11/g)).toHaveLength(5);
    expect(html).not.toContain("h-9 w-9");
  });
});

describe("Submit in the sheet", () => {
  it("is off with how many are left until every question is answered", () => {
    const html = render();
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-describedby="sheet-submit-hint"[^>]*>Submit exam/,
    );
    expect(html).toContain("Answer all questions to submit (2 left)");
  });

  it("is on when nothing is left", () => {
    const html = render({ unanswered: 0 });
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Submit exam/);
    expect(html).not.toContain("sheet-submit-hint");
  });

  it("is off when time is up", () => {
    expect(render({ unanswered: 0, timeUp: true })).toMatch(
      /<button[^>]*disabled=""[^>]*>Submit exam/,
    );
  });
});

describe("in a forward-only exam", () => {
  it("only shows where the student is: every button but the current one is off, and it says so", () => {
    const html = render({ forwardOnly: true });
    expect(html.match(/disabled=""/g)!.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain(
      'aria-label="Question 1, answered, already left, you cannot go back"',
    );
    expect(html).toContain(
      'aria-label="Question 3, not answered, not reached yet"',
    );
    expect(html).toContain("Questions you have left cannot be opened again.");
  });

  it("does not say it in a free exam, where every button is on", () => {
    const html = render({ unanswered: 0 });
    expect(html).not.toContain("cannot be opened again");
    expect(html).not.toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Question/,
    );
  });
});

describe("at 00:00", () => {
  it("turns every number off", () => {
    const html = render({ timeUp: true });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Question 1/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Question 3/);
  });
});

describe("how it is wired", () => {
  it("closes when a question is chosen, and before Submit asks", () => {
    expect(sheet).toContain("onSelect(id);\n          onClose();");
    expect(sheet).toContain("onClose();\n            onSubmit();");
  });

  it("is an overlay inside the page: nothing in it can look like leaving the exam", () => {
    expect(sheet).not.toMatch(
      /useActivityLog|examActivity|visibilitychange|blur|beforeunload/,
    );
  });

  it("is opened by the screen, closed by time running out or the layout changing, and only in the carousel layout", () => {
    expect(screen).toContain("if (!carousel || timeUp) setSheetOpen(false);");
    expect(screen).toContain("onOpenQuestions={() => setSheetOpen(true)}");
    expect(screen.indexOf("<QuestionSheet")).toBeGreaterThan(
      screen.indexOf("if (carousel) {"),
    );
    // The wide layout's root (marked too, so its title and countdown row can stick) comes after the sheet.
    const wideRoot = flat(screen).indexOf(
      flat('<div data-exam-attempt="" className="m-4'),
    );
    expect(wideRoot).toBeGreaterThan(-1);
    expect(flat(screen).indexOf("<QuestionSheet")).toBeLessThan(wideRoot);
  });

  it("leaves the other dialogs as they were: the sheet is one more way to lay out the shell", () => {
    expect(shell).toContain("items-center p-4");
    expect(shell).toContain("rounded-md bg-white p-5 dark:bg-gray-800");
    expect(shell).toContain("sheet = false");
  });
});
