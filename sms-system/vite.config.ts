/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { selectPrecache, type ViteManifest } from './src/lib/serviceWorker/precacheSelection.ts';
import { landingBuild } from './scripts/landingBuild.mjs';

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

// The service worker (src/sw.ts, docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md slice E). SERVICE_WORKER=remove
// is the safety switch: the build's worker removes itself from every device on its next visit, and the app stops
// registering one. Any other value, or none, is the normal worker.
const swMode = process.env.SERVICE_WORKER === 'remove' ? 'remove' : 'on';

// The public landing page at `/` (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md). Off unless VITE_LANDING_ENABLED is
// "true" in the build's environment, so merging it changes nothing for visitors. Off: landing.html is not built at all
// (no landing code ships) and dist/index.html is the app, as before. On: dist/index.html is the prerendered landing
// page. Either way the app is also written as dist/app.html (scripts/landingBuild.mjs explains why).
const landingEnabled = process.env.VITE_LANDING_ENABLED === 'true';

const define = {
  __APP_VERSION__: JSON.stringify(appVersion),
  __APP_COMMIT__: JSON.stringify(buildCommit()),
  __APP_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? 'development'),
  // For the copyright line on the sign-in footer, so it never needs editing at New Year.
  __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
  __SW_MODE__: JSON.stringify(swMode),
};

const alias = {
  '@': path.resolve(__dirname, 'src'),
  // nextstepjs's Next.js adapter imports this; see the comment in the file
  'next/navigation': path.resolve(__dirname, 'src/lib/nextNavigationMock.ts'),
};

const serviceWorker = VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  injectRegister: false, // src/lib/serviceWorker/swRegistration.ts registers it
  manifest: false, // not an installable app
  selfDestroying: swMode === 'remove',
  devOptions: { enabled: false },
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,png,ico}'],
    globIgnores: ['.vite/**'],
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    // Keep only the page, the core app and the registers (precacheSelection.ts), chosen from Vite's build manifest.
    manifestTransforms: [
      (entries) => {
        const manifest = JSON.parse(
          readFileSync(path.resolve(__dirname, 'dist/.vite/manifest.json'), 'utf8'),
        ) as ViteManifest;
        const keep = selectPrecache(manifest);
        return { manifest: entries.filter((entry) => keep.has(entry.url)), warnings: [] };
      },
    ],
  },
});

export default defineConfig({
  plugins: [
    react(),
    landingBuild({ enabled: landingEnabled, root: __dirname, ssrPlugins: [react()], alias, define }),
    serviceWorker,
  ],
  build: {
    // dist/.vite/manifest.json, read above to choose what the service worker keeps.
    manifest: true,
    rolldownOptions: {
      // The app is always built from index.html; the landing page only when it is on.
      input: landingEnabled
        ? { index: path.resolve(__dirname, 'index.html'), landing: path.resolve(__dirname, 'landing.html') }
        : { index: path.resolve(__dirname, 'index.html') },
    },
  },
  define,
  resolve: { alias },
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
