/// <reference lib="webworker" />
// The service worker (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice E). It keeps the app's code on the
// device, never school data: the page, the core app and the two registers' code (lib/serviceWorker/precacheSelection.ts).
// Every page load is answered with the stored page, so a signed-in tab can reload offline. There is no other caching:
// Firebase, reCAPTCHA and EmailJS are on other origins, which this worker never sees.
//
// A new version installs in the background and waits. The app tells it to take over at a safe moment
// (components/UpdateController.tsx), so it never switches during marking.

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Page loads get the stored page. Files (anything with an extension), the built assets and this worker go to the
// network as usual, as the Vercel rewrite in vercel.json does.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/assets\//, /^\/sw\.js$/, /\/[^/]+\.[^/]+$/],
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
