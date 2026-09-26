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
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
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
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
