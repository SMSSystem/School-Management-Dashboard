import { defineConfig, devices } from "@playwright/test";

// End-to-end checks for the public landing page (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md):
// accessibility (axe, WCAG 2.2 AA), keyboard, JavaScript off, reduced motion, touch and sizes, in the three browser
// engines. Separate from playwright.config.ts because it needs a production build with the landing page on (the page
// is prerendered at build time) and it never touches Firebase, so it costs no Firestore reads.
//
// Run: npm run test:e2e:landing   (builds with VITE_LANDING_ENABLED=true, then serves dist/ on port 4180)
export default defineConfig({
  testDir: "./e2e/landing",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4180",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npx vite build && npx vite preview --port 4180 --strictPort",
    url: "http://localhost:4180",
    env: { VITE_LANDING_ENABLED: "true" },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
