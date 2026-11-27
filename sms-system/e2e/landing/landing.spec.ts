import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The public landing page against its criteria (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md). Runs against a
// production build with the landing page on (playwright.landing.config.ts). No Firebase, no sign-in.

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return result.violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id}: ${n.target.join(" ")} -- ${n.any[0]?.message ?? n.failureSummary ?? ""}`,
    ),
  );
}

async function scrollThrough(page: Page) {
  // Bring every section on screen once, so lazy images load and scroll effects settle before scanning.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [375, 768, 1280, 2560]) {
    test(`no WCAG 2.2 AA violations, ${colorScheme}, ${width}px`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await scrollThrough(page);
      // Scan the settled state: back at the top, with the header split over the hero.
      await expect(page.locator(".ld-header")).toHaveAttribute(
        "data-at-top",
        "true",
      );
      expect(await axe(page)).toEqual([]);
    });
  }
}

test("one h1, the landmarks, and the footer outside main", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("header")).toHaveCount(1);
  await expect(page.locator("main#main")).toHaveCount(1);
  await expect(page.locator("main footer")).toHaveCount(0);
  await expect(
    page.locator("body > #landing-root > footer, #landing-root > footer"),
  ).toHaveCount(1);
});

test("the skip link is the first stop and moves focus to the main content", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Safari moves focus with Tab to links only when its setting is on",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("keyboard order runs through the header, then the hero", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Safari moves focus with Tab to links only when its setting is on",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const names: string[] = [];
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Tab");
    names.push(
      await page.evaluate(() =>
        (
          document.activeElement?.getAttribute("aria-label") ||
          document.activeElement?.textContent ||
          ""
        ).trim(),
      ),
    );
  }
  expect(names[0]).toBe("Skip to content");
  expect(names).toContain("Features");
  expect(names.some((n) => n.startsWith("Try the demo"))).toBe(true);
  expect(names).toContain("Log in");
});

test("theme switch: arrow keys choose, the choice is kept, and the page follows it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const group = page.getByRole("radiogroup", { name: "Colour theme" }).first();
  await group.getByRole("radio", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    group.getByRole("radio", { name: "Dark theme" }),
  ).toHaveAttribute("aria-checked", "true");
  await group.getByRole("radio", { name: "Dark theme" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    group.getByRole("radio", { name: "Light theme" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test.describe("with JavaScript off", () => {
  test.use({ javaScriptEnabled: false });

  test("all content and links are there, the menu opens, and JavaScript-only controls are hidden", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Run your whole school");
    await expect(page.locator("#features h3")).toHaveCount(5);
    await expect(page.locator("#steps h3")).toHaveCount(3);
    await expect(page.locator("noscript")).toHaveCount(1);
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await page.locator(".ld-menu > summary").click();
    await expect(
      page.locator(".ld-menu").getByRole("link", { name: "Features" }),
    ).toBeVisible();
  });

  test("follows the device theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bg).toBe("rgb(11, 21, 48)");
  });
});

test("with reduced motion nothing animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.mouse.wheel(0, 400);
  const running = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            a.playState === "running" &&
            (a.effect?.getTiming().duration ?? 0) > 1,
        ).length,
  );
  expect(running).toBe(0);
  const hero = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector(".ld-hero-card")!).animationName,
  );
  expect(hero).toBe("none");
});

test.describe("on a touch phone", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 812 },
  });

  test("features become a swipe strip with snapping and buttons", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "firefox",
      "Firefox does not emulate mobile devices",
    );
    await page.goto("/");
    const strip = page.locator(".ld-story-list");
    await expect(strip).toHaveCSS("scroll-snap-type", /x mandatory/);
    expect(
      await strip.evaluate((el) => el.scrollWidth > el.clientWidth * 3),
    ).toBe(true);
    await page.getByRole("button", { name: "Next feature" }).click();
    await expect
      .poll(() => strip.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
  });
});

test("sizes grow with the screen beyond 1440px and never overflow sideways", async ({
  page,
}) => {
  for (const [width, minRoot] of [
    [320, 16],
    [1440, 16],
    [2560, 22],
    [3840, 29],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const { root, overflow } = await page.evaluate(() => ({
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    expect(root, `${width}px`).toBeGreaterThanOrEqual(minRoot);
    expect(overflow, `${width}px`).toBe(false);
  }
});

test("loads nothing from other sites (no Firebase, reCAPTCHA or trackers)", async ({
  page,
}) => {
  const others: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://localhost:4180")) others.push(r.url());
  });
  await page.goto("/");
  await scrollThrough(page);
  expect(others).toEqual([]);
});
