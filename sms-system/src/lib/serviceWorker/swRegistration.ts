// Registers the service worker (src/sw.ts, docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md slice E) and tracks
// its updates. A new version installs in the background and waits; components/UpdateController.tsx decides when it
// takes over, at a safe moment, so the app never reloads during marking.
//
// Production builds only: `npm run dev` and the e2e tests run without a worker. A build made with
// SERVICE_WORKER=remove (vite.config.ts) is the safety switch: it registers nothing and removes any worker this
// browser has, while its own sw.js removes itself from devices that fetch it.

export type SwUpdateState = {
  /** A new version is installed and waiting to take over. */
  waiting: boolean;
  /** Another tab let the new version take over; this tab still runs the old code until it reloads. */
  reloadPending: boolean;
};

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let state: SwUpdateState = { waiting: false, reloadPending: false };
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | null = null;
let switching = false;

function setState(next: Partial<SwUpdateState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

/** Stable between changes, for useSyncExternalStore. */
export function swUpdateState(): SwUpdateState {
  return state;
}

export function subscribeSwUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: forget everything, as a fresh page load would. */
export function resetSwStateForTests(): void {
  state = { waiting: false, reloadPending: false };
  registration = null;
  switching = false;
}

function removeAll(container: ServiceWorkerContainer): void {
  void container
    .getRegistrations()
    .then((all) => all.forEach((r) => void r.unregister()))
    .catch(() => {});
}

/** Notes a waiting version. The very first install has no controller to replace, so it never waits. */
function watchForUpdates(
  reg: ServiceWorkerRegistration,
  container: ServiceWorkerContainer,
): void {
  const noteWaiting = () => {
    if (reg.waiting && container.controller) setState({ waiting: true });
  };
  noteWaiting();
  reg.addEventListener("updatefound", () => {
    const installing = reg.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") noteWaiting();
    });
  });
}

/** Asks the server for a newer sw.js now, every hour, when the connection returns and when the tab is shown. */
function checkRegularly(reg: ServiceWorkerRegistration, win: Window): void {
  const check = () => {
    if (win.navigator.onLine !== false) void reg.update().catch(() => {});
  };
  win.setInterval(check, UPDATE_CHECK_MS);
  win.addEventListener("online", check);
  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "visible") check();
  });
}

/** Registers the worker, or with the safety switch removes it. Never throws. */
export function installServiceWorker(
  win: Window = window,
  options: { mode?: "on" | "remove"; production?: boolean } = {},
): void {
  const mode = options.mode ?? __SW_MODE__;
  const production = options.production ?? import.meta.env.PROD;
  const container = win.navigator.serviceWorker as
    | ServiceWorkerContainer
    | undefined;
  if (!production || !container) return;
  if (mode === "remove") return removeAll(container);

  let controlled = !!container.controller;
  container.addEventListener("controllerchange", () => {
    // This tab asked the new version to take over: load it.
    if (switching) return win.location.reload();
    // Another tab did: this tab runs old code under the new worker, so it reloads at its own next safe moment. The
    // first install taking over an uncontrolled tab needs nothing.
    if (controlled) setState({ reloadPending: true });
    controlled = true;
  });
  container
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((reg) => {
      registration = reg;
      watchForUpdates(reg, container);
      checkRegularly(reg, win);
    })
    .catch(() => {
      // Unsupported, blocked or offline at the first visit: the app works as before, online.
    });
}

/**
 * Moves this tab to the new version: tells the waiting worker to take over (the tab reloads when it has), or reloads
 * a tab another tab already moved. Returns whether anything happens.
 */
export function applyUpdate(win: Window = window): boolean {
  const waiting = registration?.waiting;
  if (waiting) {
    switching = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    return true;
  }
  if (state.reloadPending) {
    win.location.reload();
    return true;
  }
  return false;
}
