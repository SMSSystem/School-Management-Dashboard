import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { INSTITUTIONS_ROOT, allInstitutionsKey, invalidateInstitutionsIn } from '../institutionsCache';
import { isPersistableQueryKey } from '../queryPersistence';
import { REFERENCE_STALE_MS } from '../queryPolicies';

// The platform's institutions list is read once, cached, and refreshed by the forms that change an institution.

// Fallow would count this raw-text glob as importing every file, so this test is in ignorePatterns in .fallowrc.json.
const sources = import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('the cached institutions list', () => {
  it('is kept in memory for the session only (the root is not persisted)', () => {
    expect(isPersistableQueryKey(allInstitutionsKey)).toBe(false);
    expect(isPersistableQueryKey([INSTITUTIONS_ROOT, 'page', 'first'])).toBe(false);
  });

  it('invalidating marks every entry under the root stale, and nothing else', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(allInstitutionsKey, [{ id: 'i1' }]);
    queryClient.setQueryData([INSTITUTIONS_ROOT, 'page', 'first'], 'page');
    queryClient.setQueryData([INSTITUTIONS_ROOT, 'recent'], 'recent');
    queryClient.setQueryData(['terms', 'i1'], 'terms');
    await invalidateInstitutionsIn(queryClient);
    expect(queryClient.getQueryState(allInstitutionsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState([INSTITUTIONS_ROOT, 'page', 'first'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState([INSTITUTIONS_ROOT, 'recent'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['terms', 'i1'])?.isInvalidated).toBe(false);
  });

  it('is reused for ten minutes', () => {
    expect(REFERENCE_STALE_MS).toBe(10 * 60_000);
  });
});

describe('only the shared hook reads the whole institutions collection', () => {
  const offenders: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    if (file.endsWith('/useAllInstitutions.ts') || file.includes('__tests__') || /\.test\.tsx?$/.test(file)) continue;
    text.split('\n').forEach((line, i) => {
      if (/getDocs\(\s*collection\(\s*db\s*,\s*['"]institutions['"]\s*\)\s*\)/.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }

  it('has no other whole-collection getDocs of institutions', () => {
    expect(offenders).toEqual([]);
  });

  it('the forms that create or change an institution refresh the cache', () => {
    const form = sources['../../components/forms/InstitutionForm.tsx'];
    const brand = sources['../../components/forms/BrandForm.tsx'];
    expect(form).toContain('invalidateInstitutions()');
    expect(brand).toContain('invalidateInstitutions()');
  });
});
