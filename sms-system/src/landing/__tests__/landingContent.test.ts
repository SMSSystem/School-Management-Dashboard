import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SHOT_WIDTHS, hero, stories, steps, type ShotName } from "../content";

// Content checks for the landing page: every screenshot has real alt text and exists in every theme and width the page
// asks for, and every link to another site goes through OutsideLink (the repo rule; components/OutsideLink.tsx).

const sources = import.meta.glob("../**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const shotsDir = fileURLToPath(
  new URL("../../../public/landing/shots/", import.meta.url),
);

describe("landing page content", () => {
  it("gives every screenshot a specific description", () => {
    const alts = [
      hero.shotAlt,
      hero.phoneShotAlt,
      ...stories.map((s) => s.alt),
      ...steps.map((s) => s.alt),
    ];
    for (const alt of alts) {
      expect(alt.length, alt).toBeGreaterThan(30);
      expect(alt, alt).not.toMatch(/^(image|screenshot|picture) of/i);
    }
    expect(new Set(alts).size).toBe(alts.length);
  });

  it("has every screenshot it uses, light and dark, at every width", () => {
    const names = new Set<ShotName>([
      hero.shot,
      ...stories.map((s) => s.shot),
      ...steps.map((s) => s.shot),
    ]);
    for (const name of names)
      for (const theme of ["", "-dark"])
        for (const w of SHOT_WIDTHS) {
          const file = `${name}${theme}-${w}.webp`;
          expect(existsSync(shotsDir + file), file).toBe(true);
        }
    for (const file of [
      "attendance-mobile.webp",
      "attendance-mobile-dark.webp",
    ])
      expect(existsSync(shotsDir + file), file).toBe(true);
  });

  it("opens other sites only through OutsideLink, never a bare target=_blank", () => {
    for (const [file, src] of Object.entries(sources))
      expect(src, file).not.toContain('target="_blank"');
  });
});
