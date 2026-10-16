import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIntentPrefetcher, createPrefetcher, isDataSaverOn } from '../../routes/prefetch';
import lazyPagesSource from '../../routes/lazyPages.ts?raw';
import menuSource from '../../components/Menu.tsx?raw';
import appSource from '../../App.tsx?raw';
import { menuSections } from '../sidebarNav';

// Pages load on demand (src/routes/lazyPages.ts). The sidebar starts fetching a page's code when
// its link is hovered or focused, so the chunk is usually cached by the time of the click.

const norm = (s: string) => s.split('\r\n').join('\n');
const lazyPages = norm(lazyPagesSource);
const menu = norm(menuSource);
const app = norm(appSource);

// keys of the ROUTE_LOADERS object in lazyPages.ts
const loaderBlock = lazyPages.slice(lazyPages.indexOf('export const ROUTE_LOADERS = {'), lazyPages.indexOf('export const prefetchRoute'));
const loaderKeys = [...loaderBlock.matchAll(/"(\/dashboard[^"]*)":/g)].map((m) => m[1]);

describe('ROUTE_LOADERS', () => {
  it('has an entry for every sidebar link except Home (whose page depends on the role)', () => {
    const hrefs = [...new Set(menuSections.flatMap((s) => s.items.map((i) => i.href)))].filter((h) => h !== '/dashboard');
    expect(hrefs.length).toBeGreaterThan(20);
    expect(hrefs.filter((h) => !loaderKeys.includes(h))).toEqual([]);
  });

  it('only lists routes that App.tsx really has', () => {
    expect(loaderKeys.length).toBeGreaterThan(20);
    for (const key of loaderKeys) expect(app, key).toContain(`path="${key}"`);
  });

  it('loads each page through a single import() shared by React.lazy and the prefetcher', () => {
    const lazyExports = [...lazyPages.matchAll(/export const (\w+) = lazy\(load\.(\w+)\);/g)];
    expect(lazyExports.length).toBeGreaterThan(55);
    for (const [, exported, loader] of lazyExports) expect(loader, exported).toBe(exported);
    const imports = lazyPages.match(/import\("@\/scenes\//g) ?? [];
    expect(imports.length).toBe(lazyExports.length);
  });
});

describe('the sidebar', () => {
  it('prefetches a link after a pause on hover or keyboard focus, and cancels when the pointer or focus leaves', () => {
    expect(menu).toContain('import { prefetchIntent } from "@/routes/lazyPages";');
    expect(menu).toContain('onMouseEnter={() => prefetchIntent.start(item.href)}');
    expect(menu).toContain('onMouseLeave={() => prefetchIntent.cancel(item.href)}');
    expect(menu).toContain('onFocus={() => prefetchIntent.start(item.href)}');
    expect(menu).toContain('onBlur={() => prefetchIntent.cancel(item.href)}');
  });
});

describe('createIntentPrefetcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('prefetches only after the pause, not on a pass-over', () => {
    const prefetch = vi.fn();
    const intent = createIntentPrefetcher(prefetch, 100);
    intent.start('/a');
    vi.advanceTimersByTime(99);
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(prefetch).toHaveBeenCalledWith('/a');
  });

  it('does nothing when the pointer leaves before the pause ends', () => {
    const prefetch = vi.fn();
    const intent = createIntentPrefetcher(prefetch, 100);
    intent.start('/a');
    vi.advanceTimersByTime(50);
    intent.cancel('/a');
    vi.advanceTimersByTime(500);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('tracks each link separately and ignores repeated enters on the same link', () => {
    const prefetch = vi.fn();
    const intent = createIntentPrefetcher(prefetch, 100);
    intent.start('/a');
    intent.start('/a');
    intent.start('/b');
    intent.cancel('/b');
    vi.advanceTimersByTime(200);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith('/a');
  });

  it('can cancel a link that was never started', () => {
    const intent = createIntentPrefetcher(vi.fn(), 100);
    expect(() => intent.cancel('/never')).not.toThrow();
  });
});

describe('createPrefetcher', () => {
  it('starts a known link once, however often it is hovered', () => {
    const load = vi.fn(() => Promise.resolve({}));
    const prefetch = createPrefetcher({ '/a': load }, () => false);
    prefetch('/a');
    prefetch('/a');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('ignores a link it has no loader for', () => {
    const load = vi.fn(() => Promise.resolve({}));
    const prefetch = createPrefetcher({ '/a': load }, () => false);
    expect(() => prefetch('/nope')).not.toThrow();
    expect(load).not.toHaveBeenCalled();
  });

  it('does nothing while data saving is on, and works again once it is off', () => {
    const load = vi.fn(() => Promise.resolve({}));
    let saving = true;
    const prefetch = createPrefetcher({ '/a': load }, () => saving);
    prefetch('/a');
    expect(load).not.toHaveBeenCalled();
    saving = false;
    prefetch('/a');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed prefetch, so the next hover tries again, and never throws', async () => {
    const load = vi.fn(() => Promise.reject(new Error('offline')));
    const prefetch = createPrefetcher({ '/a': load }, () => false);
    prefetch('/a');
    await Promise.resolve();
    await Promise.resolve();
    prefetch('/a');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('isDataSaverOn', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is off when the browser reports nothing', () => {
    vi.stubGlobal('navigator', {});
    expect(isDataSaverOn()).toBe(false);
  });

  it('is on for the save-data hint and for 2g links, off for faster ones', () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    expect(isDataSaverOn()).toBe(true);
    vi.stubGlobal('navigator', { connection: { effectiveType: '2g' } });
    expect(isDataSaverOn()).toBe(true);
    vi.stubGlobal('navigator', { connection: { effectiveType: 'slow-2g' } });
    expect(isDataSaverOn()).toBe(true);
    vi.stubGlobal('navigator', { connection: { effectiveType: '4g', saveData: false } });
    expect(isDataSaverOn()).toBe(false);
  });
});
