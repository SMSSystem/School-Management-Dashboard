import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RubricCarousel from "../../components/rubric/RubricCarousel";
import carouselRaw from "../../components/rubric/RubricCarousel.tsx?raw";
import modalRaw from "../../components/forms/RubricViewModal.tsx?raw";
import sectionRaw from "../../scenes/(dashboard)/list/assignments/[id]/RubricSection.tsx?raw";
import regionRaw from "../../components/exam/take/CarouselRegion.tsx?raw";
import swipeHookRaw from "../../hooks/useSwipe.ts?raw";
import shellRaw from "../../components/DialogShell.tsx?raw";
import {
  criterionPositionText,
  directionFromKey,
  stepCriterion,
} from "../rubricCarousel";
import type { RubricCriterion } from "@/types/assessment";

// The rubric carousel (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 6): its arithmetic, what it renders, and how it
// is wired. The limits of a swipe are tested with the exam carousel, in swipeTracker.test.ts and examCarousel.test.ts.

// Source text with its whitespace collapsed, so the formatter breaking a line does not fail a check.
const norm = (s: string) => s.replace(/\s+/g, " ");
const carousel = norm(carouselRaw);
const modal = norm(modalRaw);
const section = norm(sectionRaw);

const criterion = (n: number): RubricCriterion => ({
  id: `c${n}`,
  name: `Criterion name ${n}`,
  maxPoints: 4,
  levels: [
    { label: "Excellent", points: 4, description: `Excellent work on ${n}` },
    { label: "Good", points: 1 },
  ],
});
const render = (count: number) =>
  renderToStaticMarkup(
    createElement(RubricCarousel, {
      criteria: Array.from({ length: count }, (_, i) => criterion(i + 1)),
      label: "Test criteria",
    }),
  );

describe("the position line", () => {
  it("counts from one", () => {
    expect(criterionPositionText(0, 12)).toBe("Criterion 1 of 12");
    expect(criterionPositionText(11, 12)).toBe("Criterion 12 of 12");
  });

  it("stays in range when criteria have been removed", () => {
    expect(criterionPositionText(9, 3)).toBe("Criterion 3 of 3");
  });
});

describe("a step", () => {
  it("moves one criterion either way", () => {
    expect(stepCriterion(1, 3, "next")).toBe(2);
    expect(stepCriterion(1, 3, "prev")).toBe(0);
  });

  it("stops at each end and does not wrap", () => {
    expect(stepCriterion(0, 3, "prev")).toBeNull();
    expect(stepCriterion(2, 3, "next")).toBeNull();
  });

  it("leads nowhere in an empty list", () => {
    expect(stepCriterion(0, 0, "next")).toBeNull();
    expect(stepCriterion(0, 0, "prev")).toBeNull();
  });

  it("starts from the last criterion when the index is past the end", () => {
    expect(stepCriterion(9, 3, "prev")).toBe(1);
    expect(stepCriterion(9, 3, "next")).toBeNull();
  });
});

describe("the keys", () => {
  it("are the left and right arrows only", () => {
    expect(directionFromKey("ArrowRight")).toBe("next");
    expect(directionFromKey("ArrowLeft")).toBe("prev");
    for (const key of ["ArrowUp", "ArrowDown", "Enter", " ", "Tab", "a"])
      expect(directionFromKey(key)).toBeNull();
  });
});

describe("what it renders", () => {
  it("shows only the first criterion on arrival, with every level", () => {
    const html = render(12);
    expect(html).toContain("Criterion name 1");
    expect(html).toContain("Excellent work on 1");
    expect(html).toContain("4 pts max");
    expect(html).toContain("1 pt<");
    expect(html).toContain("Criterion 1 of 12");
    expect(html).not.toContain("Excellent work on 2");
  });

  it("is labelled as a carousel with a labelled slide", () => {
    const html = render(3);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-label="Test criteria"');
    expect(html).toContain('aria-roledescription="slide"');
    expect(html).toContain('aria-label="Criterion 1 of 3: Criterion name 1"');
  });

  it("announces nothing on arrival", () => {
    expect(render(3)).toContain(
      '<p role="status" aria-live="polite" class="sr-only"></p>',
    );
  });

  it("marks Previous as unavailable at the start, without the disabled attribute that would drop the focus", () => {
    const html = render(3);
    expect(html).toMatch(
      /aria-label="Previous criterion"[^>]*aria-disabled="true"/,
    );
    expect(html).toMatch(
      /aria-label="Next criterion"[^>]*aria-disabled="false"/,
    );
    expect(html).not.toMatch(/<button[^>]* disabled/);
  });

  it("lists every criterion in the jump list, by number and name", () => {
    const html = render(12);
    expect(html).toContain('aria-label="Jump to a criterion"');
    expect(html).toContain("1. Criterion name 1");
    expect(html).toContain("12. Criterion name 12");
  });

  it("has no controls for one criterion", () => {
    const html = render(1);
    expect(html).toContain("Criterion name 1");
    expect(html).not.toContain("Next criterion");
    expect(html).not.toContain("Jump to a criterion");
    expect(html).not.toContain("h-[min(55dvh,26rem)]");
  });

  it("says so when there are no criteria", () => {
    const html = render(0);
    expect(html).toContain("This rubric has no criteria yet.");
    expect(html).not.toContain("aria-roledescription");
  });
  it("marks the awarded level, or the points scored for a criterion with no levels", () => {
    const scored = renderToStaticMarkup(
      createElement(RubricCarousel, {
        criteria: [criterion(1)],
        label: "Test criteria",
        scores: [{ criterionId: "c1", points: 1, level: "Good" }],
      }),
    );
    expect(scored.match(/Awarded/g)).toHaveLength(1);
    expect(scored.indexOf("Awarded")).toBeGreaterThan(scored.indexOf(">Good"));
    expect(render(1)).not.toContain("Awarded");
    const typed = renderToStaticMarkup(
      createElement(RubricCarousel, {
        criteria: [{ id: "c9", name: "Sources", maxPoints: 10, levels: [] }],
        label: "Test criteria",
        scores: [{ criterionId: "c9", points: 7.5 }],
      }),
    );
    expect(typed).toContain("Scored 7.5 / 10");
  });
});

describe("how it is wired", () => {
  it("counts a swipe inside the view dialog, and lets the page scroll", () => {
    expect(carousel).toContain(
      "useSwipe<HTMLDivElement>(step, several, { insideDialog: true",
    );
    expect(carousel).toContain("touch-pan-y");
  });

  it("leaves the arrow keys to the jump list when it has the focus", () => {
    expect(carousel).toContain("e.target instanceof HTMLSelectElement");
  });

  it("keeps the box outside the slide, so the focus survives a move and the scroll goes back to the top", () => {
    expect(carousel).toContain("box.current.scrollTop = 0");
    expect(carousel.indexOf("ref={box}")).toBeLessThan(
      carousel.indexOf("<QuestionSlide"),
    );
  });

  it("leaves the exam carousel ignoring a touch that begins in a dialog", () => {
    expect(norm(swipeHookRaw)).toContain("{ insideDialog = false }");
    expect(norm(regionRaw)).toContain(
      "useSwipe<HTMLDivElement>(onSwipe, swipeEnabled)",
    );
  });

  it("is used by the view dialog, inside the shared dialog shell", () => {
    expect(modal).toContain(
      "<DialogShell title={rubric.title} onClose={() => setOpen(false)} card>",
    );
    expect(modal).toContain("<RubricCarousel criteria={rubric.criteria}");
    expect(modal).not.toContain("criteria.map");
  });

  it("is used by the assignment page, starting again for a different rubric", () => {
    expect(section).toContain(
      "<RubricCarousel key={rubric.id} criteria={rubric.criteria}",
    );
    expect(section).not.toContain("Table");
  });

  it("does not open the dialog with the focus on a button that does nothing", () => {
    expect(norm(shellRaw)).toContain(":not([aria-disabled='true'])");
  });
});
