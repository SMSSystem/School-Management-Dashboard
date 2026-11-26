import { afterEach, describe, expect, it, vi } from "vitest";
import { isSafeMoment } from "../serviceWorker/safeMoment";
import {
  applyUpdate,
  installServiceWorker,
  resetSwStateForTests,
  swUpdateState,
} from "../serviceWorker/swRegistration";
import swSrc from "../../sw.ts?raw";
import controllerSrc from "../../components/UpdateController.tsx?raw";
import mainSrc from "../../main.tsx?raw";
import viteConfigSrc from "../../../vite.config.ts?raw";
import boundarySrc from "../../components/PageErrorBoundary.tsx?raw";
import { flat } from "./sourceText";

// The service worker (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice E).

describe("isSafeMoment", () => {
  const clear = {
    online: true,
    locked: false,
    hasDrafts: false,
    hasUnsent: false,
  };

  it("allows the switch only online, unlocked, with no draft and nothing unsent", () => {
    expect(isSafeMoment(clear)).toBe(true);
    expect(isSafeMoment({ ...clear, online: false })).toBe(false);
    expect(isSafeMoment({ ...clear, locked: true })).toBe(false);
    expect(isSafeMoment({ ...clear, hasDrafts: true })).toBe(false);
    expect(isSafeMoment({ ...clear, hasUnsent: true })).toBe(false);
  });
});

type Listener = () => void;

/** A browser with a service worker container, enough for the registration code. */
function fakeBrowser(options: { controlled: boolean; waiting?: boolean }) {
  const containerListeners = new Map<string, Listener[]>();
  const on = (map: Map<string, Listener[]>, type: string, fn: Listener) =>
    map.set(type, [...(map.get(type) ?? []), fn]);
  const waitingWorker = { postMessage: vi.fn() };
  const registration = {
    waiting: options.waiting ? waitingWorker : null,
    installing: null,
    update: vi.fn(() => Promise.resolve()),
    unregister: vi.fn(() => Promise.resolve(true)),
    addEventListener: vi.fn(),
  };
  const container = {
    controller: options.controlled ? {} : null,
    register: vi.fn(() => Promise.resolve(registration)),
    getRegistrations: vi.fn(() => Promise.resolve([registration])),
    addEventListener: (type: string, fn: Listener) =>
      on(containerListeners, type, fn),
  };
  const reload = vi.fn();
  const win = {
    navigator: { serviceWorker: container, onLine: true },
    location: { reload },
    setInterval: vi.fn(),
    addEventListener: vi.fn(),
    document: { addEventListener: vi.fn(), visibilityState: "visible" },
  } as unknown as Window;
  const fire = (type: string) =>
    containerListeners.get(type)?.forEach((fn) => fn());
  return { win, container, registration, waitingWorker, reload, fire };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("installServiceWorker", () => {
  afterEach(() => resetSwStateForTests());

  it("does nothing outside a production build", () => {
    const b = fakeBrowser({ controlled: false });
    installServiceWorker(b.win, { mode: "on", production: false });
    expect(b.container.register).not.toHaveBeenCalled();
  });

  it("registers /sw.js for the whole site, never from the HTTP cache", async () => {
    const b = fakeBrowser({ controlled: false });
    installServiceWorker(b.win, { mode: "on", production: true });
    await settle();
    expect(b.container.register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("with the safety switch, registers nothing and removes the worker", async () => {
    const b = fakeBrowser({ controlled: true });
    installServiceWorker(b.win, { mode: "remove", production: true });
    await settle();
    expect(b.container.register).not.toHaveBeenCalled();
    expect(b.registration.unregister).toHaveBeenCalled();
  });

  it("notes a waiting update, and moves to it only when asked, reloading once it has taken over", async () => {
    const b = fakeBrowser({ controlled: true, waiting: true });
    installServiceWorker(b.win, { mode: "on", production: true });
    await settle();
    expect(swUpdateState().waiting).toBe(true);
    expect(b.waitingWorker.postMessage).not.toHaveBeenCalled();
    expect(applyUpdate(b.win)).toBe(true);
    expect(b.waitingWorker.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });
    expect(b.reload).not.toHaveBeenCalled();
    b.fire("controllerchange");
    expect(b.reload).toHaveBeenCalledTimes(1);
  });

  it("waits for a safe moment when another tab switched first, and ignores the first install taking over", async () => {
    const first = fakeBrowser({ controlled: false });
    installServiceWorker(first.win, { mode: "on", production: true });
    await settle();
    first.fire("controllerchange");
    expect(swUpdateState().reloadPending).toBe(false);
    expect(first.reload).not.toHaveBeenCalled();

    resetSwStateForTests();
    const other = fakeBrowser({ controlled: true });
    installServiceWorker(other.win, { mode: "on", production: true });
    await settle();
    other.fire("controllerchange");
    expect(swUpdateState().reloadPending).toBe(true);
    expect(other.reload).not.toHaveBeenCalled();
    expect(applyUpdate(other.win)).toBe(true);
    expect(other.reload).toHaveBeenCalledTimes(1);
  });
});

describe("the worker", () => {
  const sw = flat(swSrc);

  it("keeps only the built files and answers page loads with the stored page", () => {
    expect(sw).toContain(flat("precacheAndRoute(self.__WB_MANIFEST);"));
    expect(sw).toContain(flat('createHandlerBoundToURL("index.html")'));
    expect(sw).toContain(
      flat("denylist: [/^\\/assets\\//, /^\\/sw\\.js$/, /\\/[^/]+\\.[^/]+$/]"),
    );
  });

  it("never caches anything else: no runtime caching, no Firebase", () => {
    for (const banned of [
      "CacheFirst",
      "NetworkFirst",
      "StaleWhileRevalidate",
      "googleapis",
      "firebase",
      "caches.open",
    ])
      expect(swSrc, banned).not.toContain(banned);
  });

  it("takes over only when the app asks", () => {
    expect(sw).toContain(
      flat('if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();'),
    );
    expect(swSrc.match(/skipWaiting\(/g)).toHaveLength(1);
  });
});

describe("wiring", () => {
  it("registers from main.tsx and mounts the update controller with the app's code, never on demand", () => {
    expect(flat(mainSrc)).toContain(flat("installServiceWorker();"));
    expect(flat(mainSrc)).toContain(
      flat("import UpdateController from '@/components/UpdateController';"),
    );
    expect(mainSrc).toContain("<UpdateController />");
  });

  it("switches only at a page change or on the sign-in page, and only at a safe moment", () => {
    const src = flat(controllerSrc);
    expect(src).toContain(
      flat("if (!pageChanged && !(isSignInPage(pathname) && !user)) return;"),
    );
    expect(src).toContain(
      flat("if (!cancelled && isSafeMoment(facts)) applyUpdate();"),
    );
  });

  it("builds the worker from src/sw.ts, keeps the chosen files, and has the safety switch", () => {
    const config = flat(viteConfigSrc);
    expect(config).toContain(flat("strategies: 'injectManifest'"));
    expect(config).toContain(flat("const keep = selectPrecache(manifest);"));
    expect(config).toContain(flat("selfDestroying: swMode === 'remove',"));
    expect(config).toContain(
      flat(
        "const swMode = process.env.SERVICE_WORKER === 'remove' ? 'remove' : 'on';",
      ),
    );
  });

  it("tells someone offline that a page needs the internet, instead of an error", () => {
    expect(flat(boundarySrc)).toContain(
      flat("if (!deviceOnline()) return <OfflinePage />;"),
    );
  });
});
