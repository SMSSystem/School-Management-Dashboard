export type RouteLoader = () => Promise<unknown>;

type ConnectionInfo = { saveData?: boolean; effectiveType?: string };

// True when the browser says the person is saving data or is on a 2g link: prefetching would
// spend their data on pages they may never open.
export function isDataSaverOn(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
  if (!connection) return false;
  return (
    connection.saveData === true ||
    connection.effectiveType === "slow-2g" ||
    connection.effectiveType === "2g"
  );
}

// Waits for a short pause on a link before prefetching it, so sweeping the pointer down the
// sidebar or tabbing through it does not download every page (some are several hundred kB).
export function createIntentPrefetcher(prefetch: (href: string) => void, delayMs = 100) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    start(href: string) {
      if (timers.has(href)) return;
      timers.set(
        href,
        setTimeout(() => {
          timers.delete(href);
          prefetch(href);
        }, delayMs),
      );
    },
    cancel(href: string) {
      const timer = timers.get(href);
      if (timer === undefined) return;
      clearTimeout(timer);
      timers.delete(href);
    },
  };
}

// Starts loading a page's code ahead of the click (sidebar hover or keyboard focus). Each link is
// fetched at most once; a failed prefetch is forgotten, so the next hover tries again, and the
// error itself is ignored: opening the page later reports a real problem.
export function createPrefetcher(
  loaders: Record<string, RouteLoader>,
  shouldSkip: () => boolean = isDataSaverOn,
): (href: string) => void {
  const started = new Set<string>();
  return (href) => {
    const load = loaders[href];
    if (!load || started.has(href) || shouldSkip()) return;
    started.add(href);
    load().catch(() => {
      started.delete(href);
    });
  };
}
