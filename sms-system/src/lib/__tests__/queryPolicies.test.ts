import { describe, expect, it } from 'vitest';
import {
  COUNT_STALE_MS,
  LIST_STALE_MS,
  LIVE_STALE_MS,
  REFERENCE_STALE_MS,
} from '../queryPolicies';
import { QUERY_CACHE_MAX_AGE_MS } from '../queryPersistence';

// The cache windows live in queryPolicies.ts and nowhere else. The guard below reads every source file and fails on
// a staleTime written as a number, so a new query has to choose a named policy.

// Fallow would count this raw-text glob as importing every file, so this test is in ignorePatterns in .fallowrc.json.
const sources = import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('the stale-time policies', () => {
  it('are ordered from live to reference data, in milliseconds', () => {
    expect(LIVE_STALE_MS).toBe(60_000);
    expect(LIST_STALE_MS).toBe(5 * 60_000);
    expect(COUNT_STALE_MS).toBe(5 * 60_000);
    expect(REFERENCE_STALE_MS).toBe(10 * 60_000);
    expect(LIVE_STALE_MS).toBeLessThan(LIST_STALE_MS);
    expect(LIST_STALE_MS).toBeLessThan(REFERENCE_STALE_MS);
  });

  it('never outlast the persisted cache window, so a restored entry is not trusted past its age', () => {
    expect(REFERENCE_STALE_MS).toBeLessThanOrEqual(QUERY_CACHE_MAX_AGE_MS);
  });
});

describe('no stale time is written as a number outside queryPolicies.ts', () => {
  const offenders: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    if (file.endsWith('/queryPolicies.ts') || file.includes('__tests__') || /\.test\.tsx?$/.test(file)) continue;
    text.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      // a number other than 0 (0 means "always refetch", as in gradeTrackingLoader's forced reload)
      if (/staleTime\s*[:=][^,\n]*\b[1-9][0-9_]*\b/.test(code) || /STALE_MS\s*=\s*\d/.test(code)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }

  it('has none', () => {
    expect(offenders).toEqual([]);
  });
});
