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

// Each privacy card's opacity and offset (px), rounded, for the slide-in checks.
function cardStates(page: Page) {
  return page.locator(".ld-privacy-cards > li").evaluateAll((els) => {
    return els.map((el) => {
      const s = getComputedStyle(el);
      const m = new DOMMatrixReadOnly(
        s.transform === "none" ? "" : s.transform,
      );
      return {
        opacity: Math.round(parseFloat(s.opacity) * 100) / 100,
        x: Math.round(m.m41),
        y: Math.round(m.m42),
      };
    });
  });
}

// Scrolls so `shown` of the call-to-action card is on screen from the bottom edge (1 = all of it, centred). Uses the
// layout box, since the drawn box is scaled, and scrolls instantly, since the page otherwise scrolls smoothly.
function scrollCta(page: Page, shown: number) {
  return page.locator(".ld-cta-zoom").evaluate((el, part) => {
    let top = 0;
    for (
      let n = el as HTMLElement | null;
      n;
      n = n.offsetParent as HTMLElement | null
    )
      top += n.offsetTop;
    const h = (el as HTMLElement).offsetHeight;
    const y =
      part >= 1
        ? top - (window.innerHeight - h) / 2
        : top - window.innerHeight + h * part;
    window.scrollTo({ top: y, behavior: "instant" });
  }, shown);
}

// The call-to-action card's current scale, to two places.
function ctaScale(page: Page) {
  return page.locator(".ld-cta-zoom").evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return (
      Math.round(new DOMMatrixReadOnly(t === "none" ? "" : t).a * 100) / 100
    );
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
    expect(await cardStates(page)).toEqual(
      Array(4).fill({ opacity: 1, x: 0, y: 0 }),
    );
    // The call-to-action zoom is CSS only, so it still follows the scroll where supported; on screen it is full size.
    await scrollCta(page, 1);
    await expect.poll(() => ctaScale(page)).toBe(1);
    await page.evaluate(() => window.scrollTo(0, 0));
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
  expect(await cardStates(page)).toEqual(
    Array(4).fill({ opacity: 1, x: 0, y: 0 }),
  );
  expect(await ctaScale(page)).toBe(1);
});

test.describe("privacy cards slide in one after another", () => {
  for (const { width, height, from } of [
    { width: 1280, height: 585, from: "right" },
    { width: 375, height: 812, from: "below" },
  ] as const) {
    test(`from the ${from} at ${width}px, once`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      const cards = page.locator(".ld-privacy-cards > li");
      // Not reached yet: hidden and offset, with growing delays.
      for (const state of await cardStates(page)) {
        expect(state.opacity).toBe(0);
        if (from === "right") expect(state.x).toBeGreaterThan(0);
        else expect(state.y).toBeGreaterThan(0);
      }
      expect(
        await cards.evaluateAll((els) =>
          els.map((el) => getComputedStyle(el).transitionDelay),
        ),
      ).toEqual(["0s", "0.15s", "0.3s", "0.45s"]);
      await page.locator(".ld-privacy-cards").scrollIntoViewIfNeeded();
      await expect(page.locator(".ld-privacy-cards")).toHaveAttribute(
        "data-revealed",
        "true",
      );
      if (browserName === "webkit") {
        // Playwright's WebKit on Windows stalls transitions part-way (Safari itself does not), so jump any still
        // running to their end; the end state below is what is checked.
        await cards.evaluateAll((els) =>
          els.forEach((el) => {
            el.getBoundingClientRect(); // applies styles, so pending transitions exist now
            el.getAnimations().forEach((a) => a.finish());
          }),
        );
      }
      await expect
        .poll(() => cardStates(page), { timeout: 5000 })
        .toEqual(Array(4).fill({ opacity: 1, x: 0, y: 0 }));
      // Once: scrolling away and back does not hide them again.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      expect(await cardStates(page)).toEqual(
        Array(4).fill({ opacity: 1, x: 0, y: 0 }),
      );
    });
  }
});

test("the call-to-action card zooms in as it comes on screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 585 });
  await page.goto("/");
  const scrollLinked = await page.evaluate(() =>
    CSS.supports("animation-timeline: view()"),
  );
  const partWay = async () => {
    const scale = await ctaScale(page);
    return scale > 0.82 && scale < 0.98;
  };
  if (scrollLinked) {
    // Tied to the scroll: part-way while half on screen, full size once it is all on screen, smaller again on the
    // way back.
    await scrollCta(page, 0.5);
    await expect.poll(partWay).toBe(true);
    await scrollCta(page, 1);
    await expect.poll(() => ctaScale(page)).toBe(1);
    await scrollCta(page, 0.5);
    await expect.poll(partWay).toBe(true);
  } else {
    // Fallback: small until first seen, then one zoom to full size that stays.
    expect(await ctaScale(page)).toBe(0.8);
    await scrollCta(page, 1);
    await expect.poll(() => ctaScale(page), { timeout: 3000 }).toBe(1);
    await scrollCta(page, 0.5);
    await page.waitForTimeout(200);
    expect(await ctaScale(page)).toBe(1);
  }
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

test("step cards stack on short laptop windows only where a whole card fits", async ({
  page,
}) => {
  const cases = [
    { width: 1280, height: 585, sticky: true },
    { width: 1366, height: 657, sticky: true },
    { width: 1280, height: 800, sticky: true },
    { width: 1024, height: 500, sticky: false },
    { width: 375, height: 812, sticky: true },
    { width: 375, height: 667, sticky: false },
  ];
  for (const { width, height, sticky } of cases) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const cards = await page.locator(".ld-step").evaluateAll((els) =>
      els.map((el) => ({
        position: getComputedStyle(el).position,
        top: parseFloat(getComputedStyle(el).top),
        height: el.getBoundingClientRect().height,
      })),
    );
    for (const card of cards) {
      expect(card.position, `${width}x${height}`).toBe(
        sticky ? "sticky" : "static",
      );
      // A stuck card always fits below its offset, so the next card never covers part of it unseen.
      if (sticky)
        expect(
          card.top + card.height,
          `${width}x${height}`,
        ).toBeLessThanOrEqual(height);
    }
  }
});
