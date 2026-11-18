import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { flat } from "./sourceText";
import FlagButton from "../../components/exam/take/FlagButton";
import flagButtonRaw from "../../components/exam/take/FlagButton.tsx?raw";
import questionViewRaw from "../../components/exam/take/StudentQuestionView.tsx?raw";
import {
  FLAG_TOOLTIP_HEIGHT_PX,
  flagTooltipText,
  tooltipPlacement,
} from "../examFlagTooltip";

// The tooltip of the "Flag for review" button (EXAMS_FEATURE_SPEC.md §4.5): what it says, which devices get it by
// hovering and which by tapping an info icon, and where it opens.

const norm = (s: string) => s.split("\r\n").join("\n");
const button = norm(flagButtonRaw);
const render = (flagged: boolean) =>
  renderToStaticMarkup(
    createElement(FlagButton, { flagged, disabled: false, onToggle: () => {} }),
  );

describe("flagTooltipText", () => {
  it("always says what the button does and that the answer is not affected", () => {
    for (const flagged of [false, true]) {
      expect(flagTooltipText(flagged).what).toBe(
        "Mark this question to come back to it. It does not change your answer.",
      );
    }
  });

  it("adds a line that depends on whether the question is flagged", () => {
    expect(flagTooltipText(false).state).toBe(
      "Flagged questions are highlighted in the question list and counted before you submit.",
    );
    expect(flagTooltipText(true).state).toBe(
      "This question is flagged. Press again to remove the flag.",
    );
  });
});

describe("tooltipPlacement", () => {
  it("opens above the button unless there is less room above than the tooltip needs", () => {
    expect(tooltipPlacement(400)).toBe("above");
    expect(tooltipPlacement(FLAG_TOOLTIP_HEIGHT_PX + 8)).toBe("above");
    expect(tooltipPlacement(FLAG_TOOLTIP_HEIGHT_PX + 7)).toBe("below");
    expect(tooltipPlacement(0)).toBe("below");
  });
});

describe("FlagButton", () => {
  it("keeps the button, its pressed state and its labels, and describes it with the tooltip", () => {
    const off = render(false);
    expect(off).toContain("Flag for review");
    expect(off).toContain('aria-pressed="false"');
    const id = /aria-describedby="([^"]+)"/.exec(off)?.[1];
    expect(id).toBeTruthy();
    expect(off).toContain(`id="${id}" role="tooltip"`);
    expect(render(true)).toContain("Flagged for review");
    expect(render(true)).toContain(
      "This question is flagged. Press again to remove the flag.",
    );
    expect(off).not.toContain("title=");
  });

  it("has a touch-only info icon with a name, and shows the tooltip on hover only for a fine pointer", () => {
    const html = render(false);
    expect(html).toContain('aria-label="What does Flag for review do?"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/class="hidden \[@media\(hover:none\)\]:inline-flex/);
    expect(html).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:group-hover:block",
    );
    expect(html).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:group-focus-within:block",
    );
    // Tailwind only makes a class it finds written out whole in a scanned file, and this test file is scanned too, so the
    // pin is on the component's own source (a class built from pieces there was once never generated).
    expect(button).toContain("[@media(hover:none)]:inline-flex");
    expect(button).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:group-hover:block",
    );
    expect(button).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:group-focus-within:block",
    );
    expect(button).not.toMatch(/\$\{[A-Z_]+\}:/);
    // closed by default: nothing but the media rules can show it
    expect(html).toMatch(/role="tooltip"[^>]*class="[^"]*\bhidden\b/);
  });

  it("is as wide as the screen under 640px and a fixed-width bubble above it, and closes in the three ways", () => {
    expect(button).toContain("FLAG_TOOLTIP_NARROW_MAX_PX");
    expect(button).toContain('"fixed"');
    expect(button).toContain("absolute right-0 w-72");
    expect(button).toContain('document.addEventListener("pointerdown"');
    expect(button).toContain('e.key === "Escape"');
    expect(button).toContain("FLAG_TOOLTIP_AUTO_CLOSE_MS");
  });

  it("is used by the question view in place of the old inline button", () => {
    const view = norm(questionViewRaw);
    expect(flat(view)).toContain(
      flat(
        "<FlagButton flagged={flagged} disabled={disabled} onToggle={onToggleFlag} />",
      ),
    );
    expect(view).not.toContain("aria-pressed");
  });
});
