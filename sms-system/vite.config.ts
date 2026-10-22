/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
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
