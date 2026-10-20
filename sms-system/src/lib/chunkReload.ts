// A page is loaded on demand (see src/routes/lazyPages.ts), and each deploy gives every chunk a new
// file name. A tab opened before a deploy can therefore ask for a chunk that no longer exists.
// Vite reports that as a "vite:preloadError" event; the fix is to load the new version of the app.
//
// Reload at most once a minute, and never while offline: there is no service worker, so reloading
// an offline tab would replace the app with the browser's error page. In those cases the error
// reaches PageErrorBoundary, which offers a Reload button.

export const CHUNK_RELOAD_KEY = "sms_chunk_reload_at";
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

export function shouldReloadForChunkError(input: {
  online: boolean;
  now: number;
  lastReloadAt: number | null;
  windowMs?: number;
}): boolean {
  if (!input.online) return false;
  if (input.lastReloadAt === null) return true;
  return input.now - input.lastReloadAt >= (input.windowMs ?? CHUNK_RELOAD_WINDOW_MS);
}

// Returns a function that removes the listener again (used by the tests).
export function installChunkReloadGuard(win: Window = window): () => void {
  const onPreloadError = () => {
    let lastReloadAt: number | null;
    try {
      const stored = win.sessionStorage.getItem(CHUNK_RELOAD_KEY);
      const parsed = stored === null ? NaN : Number(stored);
      lastReloadAt = Number.isFinite(parsed) ? parsed : null;
    } catch {
      return; // storage blocked: without a record of the last reload, a reload loop is possible
    }
    const now = Date.now();
    if (!shouldReloadForChunkError({ online: win.navigator.onLine, now, lastReloadAt })) return;
    try {
      win.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
    } catch {
      return;
    }
    win.location.reload();
  };
  win.addEventListener("vite:preloadError", onPreloadError);
  return () => win.removeEventListener("vite:preloadError", onPreloadError);
}
