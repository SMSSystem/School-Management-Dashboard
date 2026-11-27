/// <reference lib="webworker" />
// The service worker (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice E). It keeps the app's code on the
// device, never school data: the page, the core app and the two registers' code (lib/serviceWorker/precacheSelection.ts).
// Every app page load is answered with the stored app shell, so a signed-in tab can reload offline. There is no other caching:
// Firebase, reCAPTCHA and EmailJS are on other origins, which this worker never sees.
//
// A new version installs in the background and waits. The app tells it to take over at a safe moment
// (components/UpdateController.tsx), so it never switches during marking.

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  matchPrecache,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// `/` is whatever dist/index.html is: the app, or the public landing page when VITE_LANDING_ENABLED is on
// (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md). It is fetched from the network so the current one is shown. The
// stored copy is used when there is no connection, or when the network has not answered within ROOT_NETWORK_TIMEOUT_MS
// (a connection that hangs instead of failing would otherwise keep the visitor waiting for the browser's own timeout).
// With nothing stored, it keeps waiting for the network. Registered first: the first matching route wins.
const ROOT_NETWORK_TIMEOUT_MS = 4000;
registerRoute(
  ({ request, url }) => request.mode === "navigate" && url.pathname === "/",
  async ({ request }) => {
    const network = fetch(request);
    network.catch(() => undefined); // handled below; stops an unhandled rejection when the timer wins
    const timer = new Promise<undefined>((resolve) =>
      setTimeout(resolve, ROOT_NETWORK_TIMEOUT_MS),
    );
    try {
      const response = await Promise.race([network, timer]);
      if (response) return response;
    } catch {
      // no connection: use the stored copy
    }
    return (await matchPrecache("index.html")) ?? network;
  },
);

// Every other page load gets the stored app shell. It is `app.html`, which the build always writes as a copy of the
// app's index.html (scripts/landingBuild.mjs), so app pages keep working when `/` is the landing page. Files
// (anything with an extension), the built assets and this worker go to the network as usual, as the Vercel rewrite
// in vercel.json does.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("app.html"), {
    denylist: [/^\/$/, /^\/assets\//, /^\/sw\.js$/, /\/[^/]+\.[^/]+$/],
  }),
);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// The first install takes the open tabs at once, so they can reload offline without visiting again. An update only
// gets here after the app asked it to take over.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
