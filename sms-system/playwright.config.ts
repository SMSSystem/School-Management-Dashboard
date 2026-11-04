import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

// Loads QA_* credentials + QA_INSTITUTION_NAME/QA_CUSTOM_INSTITUTION_NAME
// (see .env.qa, gitignored) via Node's built-in env-file loader — no
// dotenv dependency needed. Never loaded into the app bundle itself: these
// are read Node-side by test files only, kept separate from the
// VITE_FIREBASE_* vars Vite exposes to the browser.
try {
  process.loadEnvFile('.env.qa');
} catch {
  // Missing in CI/other machines — tests that need QA_* will fail with a
  // clear "undefined" error rather than a confusing loader crash.
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // shared live Firestore project — avoid cross-test races
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',
  // Playwright's 30s default is sized for fast, isolated UI assertions —
  // this suite's specs each drive a real login (itself ~15-20s against live
  // Firebase Auth) followed by many sequential page visits/writes, so a
  // single test can legitimately take a few minutes.
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Vite's cold-start dependency pre-bundling (first request after the dev
    // server boots) can comfortably exceed Playwright's 30s default here —
    // bumped rather than treated as a real hang.
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    // Download all on phones and tablets, off in production until it has been tested on real devices.
    env: { VITE_SEQUENTIAL_DOWNLOADS: 'true' },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
