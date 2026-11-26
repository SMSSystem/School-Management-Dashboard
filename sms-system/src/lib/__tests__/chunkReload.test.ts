import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  installChunkReloadGuard,
  shouldReloadForChunkError,
} from '../chunkReload';
import mainSource from '../../main.tsx?raw';
import { routingFile } from './appSource';

// Pages load on demand, and each deploy renames every chunk, so a tab opened before a deploy can
// fail to fetch a page it has not opened yet. Vite reports that as "vite:preloadError".

describe('shouldReloadForChunkError', () => {
  const now = 1_000_000;

  it('reloads when online and never reloaded before', () => {
    expect(shouldReloadForChunkError({ online: true, now, lastReloadAt: null })).toBe(true);
  });

  it('never reloads while offline (the missing chunk is not kept on the device, so a reload cannot fetch it)', () => {
    expect(shouldReloadForChunkError({ online: false, now, lastReloadAt: null })).toBe(false);
  });

  it('does not reload again within the window, to avoid a reload loop', () => {
    expect(shouldReloadForChunkError({ online: true, now, lastReloadAt: now - 1_000 })).toBe(false);
    expect(shouldReloadForChunkError({ online: true, now, lastReloadAt: now - (CHUNK_RELOAD_WINDOW_MS - 1) })).toBe(false);
  });

  it('reloads again once the window has passed', () => {
    expect(shouldReloadForChunkError({ online: true, now, lastReloadAt: now - CHUNK_RELOAD_WINDOW_MS })).toBe(true);
  });
});

function fakeWindow(options: { online?: boolean; stored?: string; storageBlocked?: boolean } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const store = new Map<string, string>();
  if (options.stored !== undefined) store.set(CHUNK_RELOAD_KEY, options.stored);
  const reload = vi.fn();
  const blocked = () => {
    if (options.storageBlocked) throw new Error('storage blocked');
  };
  const win = {
    navigator: { onLine: options.online ?? true },
    sessionStorage: {
      getItem: (key: string) => {
        blocked();
        return store.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        blocked();
        store.set(key, value);
      },
    },
    location: { reload },
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  } as unknown as Window;
  const fire = () => listeners.get('vite:preloadError')?.forEach((fn) => fn());
  return { win, fire, reload, store };
}

describe('installChunkReloadGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reloads once on the first failure and remembers when', () => {
    const { win, fire, reload, store } = fakeWindow();
    installChunkReloadGuard(win);
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.get(CHUNK_RELOAD_KEY)).toBe(String(Date.now()));
  });

  it('does not reload a second time within a minute, then does after it', () => {
    const { win, fire, reload } = fakeWindow();
    installChunkReloadGuard(win);
    fire();
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CHUNK_RELOAD_WINDOW_MS);
    fire();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload while offline', () => {
    const { win, fire, reload } = fakeWindow({ online: false });
    installChunkReloadGuard(win);
    fire();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when storage is blocked, because it could loop', () => {
    const { win, fire, reload } = fakeWindow({ storageBlocked: true });
    installChunkReloadGuard(win);
    fire();
    expect(reload).not.toHaveBeenCalled();
  });

  it('treats an unreadable stored value as "never reloaded"', () => {
    const { win, fire, reload } = fakeWindow({ stored: 'not a number' });
    installChunkReloadGuard(win);
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stops listening once the returned function is called', () => {
    const { win, fire, reload } = fakeWindow();
    installChunkReloadGuard(win)();
    fire();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('App.tsx and the sign-in routes', () => {
  const app = routingFile('App.tsx');

  it('catches a page that cannot be loaded, on the register routes as well as the dashboard', () => {
    // Without a boundary a failed chunk would unmount the whole app and leave a blank screen.
    const authBranch = routingFile('routes/AuthRoutes.tsx');
    expect(authBranch).toContain('<PageErrorBoundary resetKey={location.key}>');
    expect(authBranch.indexOf('<PageErrorBoundary')).toBeLessThan(authBranch.indexOf('<Suspense'));
    expect(authBranch.indexOf('</Suspense>')).toBeLessThan(authBranch.indexOf('</PageErrorBoundary>'));
    const dashboard = app.slice(app.indexOf('<DashboardLayout>'));
    expect(dashboard.indexOf('<PageErrorBoundary')).toBeLessThan(dashboard.indexOf('<Suspense'));
  });
});

describe('main.tsx', () => {
  it('installs the guard before the app renders', () => {
    const main = mainSource.split('\r\n').join('\n');
    expect(main).toContain("import { installChunkReloadGuard } from '@/lib/chunkReload';");
    expect(main.indexOf('installChunkReloadGuard();')).toBeGreaterThan(-1);
    expect(main.indexOf('installChunkReloadGuard();')).toBeLessThan(main.indexOf('createRoot('));
  });
});
