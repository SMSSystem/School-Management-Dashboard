// The monthly limit on Realtime Database downloads (LESSON_NOTE_12_FILES_SPEC.md section 6). Spark allows 10 GB a month
// across all schools, and going over can shut the app off for the rest of that month, so the app stops well before it.
// Pure, so the thresholds can be tested without a database; blobStore.ts reads and raises the counters.

export const DOWNLOAD_ALL_OFF_TOTAL_BYTES = 6_000_000_000;
export const DOWNLOAD_ALL_OFF_SCHOOL_BYTES = 3_000_000_000;
export const DOWNLOADS_STOP_TOTAL_BYTES = 8_500_000_000;
// Mirrors database.rules.json: a counter may rise by at most this much in one write.
export const MAX_DOWNLOAD_STEP_BYTES = 7_100_000;

export const DOWNLOAD_ALL_OFF_MESSAGE = 'Download all is off for the rest of this month. You can still download each file.';
export const DOWNLOADS_STOPPED_MESSAGE = 'Large files can’t be downloaded for the rest of this month. Files under 500KB still work.';
export const LARGE_FILE_READS_PAUSED_MESSAGE = 'Large files are paused. Files under 500KB still work.';
export const LARGE_FILE_WRITES_PAUSED_MESSAGE = 'Large file uploads are paused. Files under 500KB can still be saved.';

export const READS_PAUSED_PATH = 'config/largeFileReadsPaused';
export const WRITES_PAUSED_PATH = 'config/largeFileWritesPaused';

/** The counters' month, in UTC. Firebase does not say exactly when its month turns, which the thresholds' margin allows for. */
export const downloadMonth = (now: Date = new Date()): string => now.toISOString().slice(0, 7);

export const totalDownloadsPath = (month: string): string => `usage/downloads/${month}/total/bytes`;
export const schoolDownloadsPath = (month: string, institutionId: string): string =>
  `usage/downloads/${month}/institutions/${institutionId}/bytes`;

/** What a download of a file this size costs on the wire: base64, about 4/3, plus its short prefix. */
export const wireBytes = (size: number): number => Math.min(MAX_DOWNLOAD_STEP_BYTES, Math.ceil((size * 4) / 3) + 100);

export type DownloadUsage = { school: number; total: number };
export type DownloadLevel = 'normal' | 'soft' | 'hard';

export function downloadLevel(usage: DownloadUsage): DownloadLevel {
  if (usage.total >= DOWNLOADS_STOP_TOTAL_BYTES) return 'hard';
  if (usage.total >= DOWNLOAD_ALL_OFF_TOTAL_BYTES || usage.school >= DOWNLOAD_ALL_OFF_SCHOOL_BYTES) return 'soft';
  return 'normal';
}
