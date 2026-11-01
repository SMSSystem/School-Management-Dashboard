/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The app shows its version (src/lib/appVersion.ts). Only the version string is passed in: importing
// package.json from src would put the whole file, dependency list included, into the client bundle.
// Vercel sets VERCEL_GIT_COMMIT_SHA and VERCEL_ENV on its builds; elsewhere git gives the commit.
const appVersion = (JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version;
function buildCommit(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'local';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(buildCommit()),
    __APP_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? 'development'),
    // For the copyright line on the sign-in footer, so it never needs editing at New Year.
    __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // nextstepjs's Next.js adapter imports this; see the comment in the file
      'next/navigation': path.resolve(__dirname, 'src/lib/nextNavigationMock.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Several tests read or walk the whole src/ tree (the import-graph and bundle-boundary tests, loadErrorHandling,
    // usersQueries, studentClassQueries, studentParentQueries, userPhotoReads, cardBoundaries, examImportBundle). They take a
    // few seconds on an idle machine and 20 to 45 seconds on a busy one (a build, an emulator or a browser running at the
    // same time), which failed full runs at 20 seconds. This only matters under load; a test that really hangs still fails.
    testTimeout: 60_000,
  },
});
