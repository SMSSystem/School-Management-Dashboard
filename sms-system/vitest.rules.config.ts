import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The Firestore security-rules tests (rules-tests/). They need the Firestore emulator, so they run only through
// `npm run test:rules`, which starts the emulator around this config (the normal `npm test` includes src/ only).
export default defineConfig({
  // The app's own modules that a test builds documents with (src/lib/exam*.ts) import through '@/'.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
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
