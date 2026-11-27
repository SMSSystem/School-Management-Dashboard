import { describe, expect, it } from "vitest";
import { buildStaticGraph } from "../../../scripts/bundleGraphLogic.mjs";
import firebaseSrc from "../../lib/firebase.ts?raw";

// The landing page must stay small, private and fast (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md): its code may
// never reach Firebase, reCAPTCHA or the app, and the app may never pull in the landing page. Static imports only,
// as the bundler sees them (scripts/bundleGraphLogic.mjs).

const BANNED_PACKAGES = [
  "firebase",
  "@firebase",
  "@tanstack/react-query",
  "react-router-dom",
];

describe("landing page boundaries", () => {
  for (const entry of [
    "src/landing/main.tsx",
    "src/landing/entry-server.tsx",
  ]) {
    it(`${entry} reaches no Firebase, router, query client or app code`, () => {
      const graph = buildStaticGraph({ entry });
      for (const pkg of BANNED_PACKAGES)
        expect(graph.packageImporters.has(pkg), pkg).toBe(false);
      const reached = [...graph.parent.keys()];
      expect(reached).not.toContain("src/main.tsx");
      expect(reached).not.toContain("src/App.tsx");
      expect(
        reached.filter(
          (f) => f.startsWith("src/lib/") && /firebase|AuthContext/.test(f),
        ),
      ).toEqual([]);
      // Shared pieces it is allowed to reuse.
      expect(reached).toContain("src/components/OutsideLink.tsx");
      expect(reached).toContain("src/lib/publicLinks.ts");
    });
  }

  it("the app never reaches the landing page", () => {
    const graph = buildStaticGraph({ entry: "src/main.tsx" });
    expect(
      [...graph.parent.keys()].filter((f) => f.startsWith("src/landing/")),
    ).toEqual([]);
  });

  it("the signed-in check in public/landing-boot.js matches the app's sign-in storage (sessionStorage)", () => {
    // If this fails, the app changed how sign-in is stored; update the boot script's isSignedIn() to match.
    expect(firebaseSrc).toContain(
      "initializeAuth(app, { persistence: browserSessionPersistence })",
    );
  });
});
