import { describe, expect, it } from 'vitest';
import rulesRaw from '../../../database.rules.json?raw';
import {
  DOWNLOADS_STOP_TOTAL_BYTES,
  DOWNLOAD_ALL_OFF_SCHOOL_BYTES,
  DOWNLOAD_ALL_OFF_TOTAL_BYTES,
  MAX_DOWNLOAD_STEP_BYTES,
  READS_PAUSED_PATH,
  WRITES_PAUSED_PATH,
  downloadLevel,
  downloadMonth,
  schoolDownloadsPath,
  totalDownloadsPath,
  wireBytes,
} from '../downloadGate';

describe('downloadLevel', () => {
  it('is normal below every limit', () => {
    expect(downloadLevel({ school: 0, total: 0 })).toBe('normal');
    expect(downloadLevel({ school: DOWNLOAD_ALL_OFF_SCHOOL_BYTES - 1, total: DOWNLOAD_ALL_OFF_TOTAL_BYTES - 1 })).toBe('normal');
  });

  it('is soft from either the school share or the total', () => {
    expect(downloadLevel({ school: DOWNLOAD_ALL_OFF_SCHOOL_BYTES, total: 0 })).toBe('soft');
    expect(downloadLevel({ school: 0, total: DOWNLOAD_ALL_OFF_TOTAL_BYTES })).toBe('soft');
  });

  it('is hard from the total, whatever the school has used', () => {
    expect(downloadLevel({ school: 0, total: DOWNLOADS_STOP_TOTAL_BYTES - 1 })).toBe('soft');
    expect(downloadLevel({ school: 0, total: DOWNLOADS_STOP_TOTAL_BYTES })).toBe('hard');
  });

  it('keeps the limits inside the 10 GB a month that Spark allows', () => {
    expect(DOWNLOAD_ALL_OFF_SCHOOL_BYTES).toBeLessThan(DOWNLOAD_ALL_OFF_TOTAL_BYTES);
    expect(DOWNLOAD_ALL_OFF_TOTAL_BYTES).toBeLessThan(DOWNLOADS_STOP_TOTAL_BYTES);
    expect(DOWNLOADS_STOP_TOTAL_BYTES).toBeLessThan(10_000_000_000);
  });
});

describe('wireBytes', () => {
  it('counts base64 and the short prefix', () => {
    expect(wireBytes(3000)).toBe(4100);
  });

  it('keeps a maximum-size file inside the step the rules allow', () => {
    expect(wireBytes(5 * 1024 * 1024)).toBeLessThanOrEqual(MAX_DOWNLOAD_STEP_BYTES);
    expect(wireBytes(50 * 1024 * 1024)).toBe(MAX_DOWNLOAD_STEP_BYTES);
  });
});

describe('paths', () => {
  it('uses the UTC month', () => {
    expect(downloadMonth(new Date('2026-11-30T23:59:59Z'))).toBe('2026-11');
    expect(downloadMonth(new Date('2026-12-01T00:00:00Z'))).toBe('2026-12');
  });

  it('builds the counters the rules know', () => {
    expect(totalDownloadsPath('2026-11')).toBe('usage/downloads/2026-11/total/bytes');
    expect(schoolDownloadsPath('2026-11', 'abc')).toBe('usage/downloads/2026-11/institutions/abc/bytes');
  });
});

describe('matches database.rules.json', () => {
  const rules = JSON.parse(rulesRaw).rules;

  it('has the same step limit', () => {
    expect(rules.usage.downloads.$month.total.bytes['.validate']).toContain(`+ ${MAX_DOWNLOAD_STEP_BYTES}`);
  });

  it('has both switches at the paths this file reads', () => {
    expect(READS_PAUSED_PATH).toBe('config/largeFileReadsPaused');
    expect(WRITES_PAUSED_PATH).toBe('config/largeFileWritesPaused');
    expect(rules.config.largeFileReadsPaused['.write']).toBe(false);
    expect(rules.config.largeFileWritesPaused['.write']).toBe(false);
  });
});
