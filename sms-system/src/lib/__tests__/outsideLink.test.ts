import { describe, expect, it } from "vitest";
import {
  leavingNote,
  leavingText,
  shouldConfirmLeaving,
} from "../outsideLinks";
import { siteNameFor } from "../siteName";
import linkSrc from "../../components/OutsideLink.tsx?raw";
import dialogSrc from "../../components/LeavingDialog.tsx?raw";
import linksSrc from "../outsideLinks.ts?raw";
import noteSrc from "../../components/forms/LessonNoteViewModal.tsx?raw";
import aboutSrc from "../../scenes/(dashboard)/settings/AboutPanel.tsx?raw";
import footerSrc from "../../components/PublicFooter.tsx?raw";
import headerSrc from "../../components/TopHeader.tsx?raw";
import { flat } from "./sourceText";

// Outside links (components/OutsideLink.tsx) and the "You're leaving" check (components/LeavingDialog.tsx).

describe("which clicks ask first", () => {
  it("a left click (with or without keys held) and a middle click; never a right click", () => {
    expect(shouldConfirmLeaving({ button: 0 })).toBe(true);
    expect(shouldConfirmLeaving({ button: 1 })).toBe(true);
    expect(shouldConfirmLeaving({ button: 2 })).toBe(false);
  });

  it("stops the browser following the link, on click and on middle click, before the dialog opens", () => {
    const src = flat(linkSrc);
    expect(src).toContain(
      flat("if (!leaving || !shouldConfirmLeaving(e)) return;"),
    );
    expect(src.indexOf("e.preventDefault();")).toBeLessThan(
      src.indexOf("setAsking(true);"),
    );
    expect(src).toContain(flat("onClick={ask}"));
    expect(src).toContain(flat("onAuxClick={ask}"));
  });
});

describe("every outside link", () => {
  it("opens in a new tab cut off from this page", () => {
    expect(flat(linkSrc)).toContain(
      flat('target="_blank" rel="noopener noreferrer"'),
    );
    expect(flat(linksSrc)).toContain(
      flat('window.open(url, "_blank", "noopener,noreferrer");'),
    );
    // It shows, and opens, the browser's own form of the address (punycode for lookalike letters).
    expect(flat(dialogSrc)).toContain(
      flat("const shown = parseWebUrl(url)?.href ?? url;"),
    );
    expect(flat(dialogSrc)).toContain(flat("openOutside(shown);"));
    expect(flat(dialogSrc)).toContain(flat("{shown}"));
  });

  it("goes through OutsideLink, asking for teacher links and the changelog, not for the footer", () => {
    expect(flat(noteSrc)).toContain(
      flat('<OutsideLink href={link.url} leaving="lesson-note"'),
    );
    expect(flat(aboutSrc)).toContain(
      flat('<OutsideLink href={CHANGELOG_URL} leaving="changelog"'),
    );
    const footer = flat(footerSrc);
    expect(footer.match(/<OutsideLink/g)).toHaveLength(2);
    expect(footer).not.toContain("leaving=");
    for (const src of [noteSrc, aboutSrc, footerSrc])
      expect(src).not.toContain('target="_blank"');
  });

  it("keeps re-checking a lesson-note link before it becomes a link", () => {
    expect(flat(noteSrc)).toContain(
      flat("{validateLessonNoteUrl(link.url) === null ?"),
    );
  });
});

describe("the dialog", () => {
  it("puts Go back first, so it has the focus", () => {
    const src = flat(dialogSrc);
    expect(src.indexOf("{leavingText.goBack}")).toBeGreaterThan(-1);
    expect(src.indexOf("{leavingText.goBack}")).toBeLessThan(
      src.indexOf("{leavingText.continue}"),
    );
  });

  it("says where you are and where you're going, and who added a teacher's link", () => {
    expect(leavingText.title("Blue Hills High")).toBe(
      "You're leaving Blue Hills High",
    );
    expect(leavingText.body("Blue Hills High")).toBe(
      "This link goes to a site outside Blue Hills High. Make sure you trust it before continuing.",
    );
    expect(leavingNote("lesson-note")).toBe(
      "A teacher added this link. We don't check what's on it.",
    );
    expect(leavingNote("changelog")).toBeNull();
    expect(leavingText.continue).toBe("Continue to site");
    expect(leavingText.goBack).toBe("Go back");
  });

  it("names the site as the top bar does", () => {
    expect(siteNameFor("super_admin", "Any School")).toBe("School Management");
    expect(siteNameFor("regular_teacher", "Blue Hills High")).toBe(
      "Blue Hills High",
    );
    expect(siteNameFor("student", null)).toBe("School Management");
    expect(flat(headerSrc)).toContain(flat("const siteName = useSiteName();"));
  });
});
