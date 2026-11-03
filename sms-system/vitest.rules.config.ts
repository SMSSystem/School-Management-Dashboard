import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The Firestore security-rules tests (rules-tests/). They need the Firestore emulator, so they run only through
// `npm run test:rules`, which starts the emulator around this config (the normal `npm test` includes src/ only).
export default defineConfig({
  // The app's own modules that a test builds documents with (src/lib/exam*.ts) import through '@/'.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // src/lib/appVersion.ts reads these when it loads (vite.config.ts `define` has the real values). No rule test looks at them.
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-rules-test'),
    __APP_COMMIT__: JSON.stringify('local'),
    __APP_ENV__: JSON.stringify('development'),
    __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
  },
  test: {
    environment: 'node',
    include: ['rules-tests/**/*.test.ts'],
    // One worker: every file clears and reseeds the same emulator database.
    fileParallelism: false,
    // Generous: the emulator and the test clients are slow to start on a busy machine.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
