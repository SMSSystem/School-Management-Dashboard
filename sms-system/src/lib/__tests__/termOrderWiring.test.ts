import { describe, expect, it } from 'vitest';
import termsPageRaw from '../../scenes/(dashboard)/list/terms/index.tsx?raw';
import termsHookRaw from '../../hooks/useInstitutionTerms.ts?raw';
import orderHookRaw from '../../hooks/useTermOrder.ts?raw';

// Where the term order (lib/termOrder.ts) is applied: the Terms page, before it slices into pages, and the shared
// terms hook, so every term dropdown follows. Source-text pins, like the other wiring tests.

const lf = (s: string) => s.split('\r\n').join('\n');
const termsPage = lf(termsPageRaw);
const termsHook = lf(termsHookRaw);
const orderHook = lf(orderHookRaw);

describe('the Terms page', () => {
  it('orders the terms before it slices them into pages', () => {
    const sort = termsPage.indexOf('sortTerms(');
    const slice = termsPage.indexOf('.slice((page - 1) * PAGE_SIZE');
    expect(sort, 'the page should sort').toBeGreaterThan(-1);
    expect(slice, 'the page should paginate').toBeGreaterThan(-1);
    expect(sort).toBeLessThan(slice);
    expect(termsPage).toContain('useTermOrder()');
  });
});

describe('every term dropdown', () => {
  it('gets the terms in order from the shared hook, while the cache keeps them as read', () => {
    expect(termsHook).toContain('useTermOrder()');
    expect(termsHook).toContain('select: sortTerms');
    expect(termsHook).toContain('queryFn: () => fetchTerms(institutionId as string)');
  });
});

describe('the order hook', () => {
  it('reads the academic years only for a custom calendar, from the calendar hook\'s cache entry', () => {
    expect(orderHook).toContain("enabled: custom && DATA_MODE === 'live'");
    expect(orderHook).toContain("queryKey: ['academicYears', institutionId ?? '']");
    expect(orderHook).toContain('fetchAcademicYears');
  });
});
