// Build step for the public landing page (docs/miscellaneous-specs/LANDING_PAGE_SPEC.md). Used by vite.config.ts.
//
// Why this exists: Vercel answers `/` with the real file dist/index.html before it applies any rewrite, so the landing
// page can only live at `/` by *being* dist/index.html. The app keeps its own source index.html (the dev server, the
// e2e tests and the loading-hint test all rely on that) and is written a second time as dist/app.html. vercel.json
// sends every app path to /app.html and the service worker (src/sw.ts) answers app page loads with it.
//
// What it does, in the bundle Vite is about to write:
//   - always: emits app.html, a byte-for-byte copy of the built app index.html. With the landing page off,
//     dist/index.html is still the app, so `/` behaves exactly as before.
//   - landing on (VITE_LANDING_ENABLED=true): renders the landing page to HTML on the build machine
//     (src/landing/entry-server.tsx), puts it into the built landing.html at LANDING_SLOT, writes the result as
//     index.html and drops landing.html. The page is complete HTML before any JavaScript runs, which is what makes
//     it readable with JavaScript off and quick to show.
//
// `enforce: 'post'` runs this after Vite has written the HTML (with its hashed script and style tags) into the
// bundle, and before vite-plugin-pwa reads dist/ for the service worker's precache list, so app.html gets a revision.

import { createServer } from "vite";

/** The comment in landing.html that the prerendered markup replaces. */
export const LANDING_SLOT = "<!--landing-prerender-->";

/**
 * Renders src/landing/entry-server.tsx with a throwaway Vite server (no files written), using the same aliases,
 * plugins and `define` values as the client build so the HTML matches what the browser hydrates.
 * @param {{ root: string, plugins: import('vite').PluginOption[], alias: Record<string, string>, define: Record<string, string> }} options
 * @returns {Promise<string>}
 */
async function renderLanding({ root, plugins, alias, define }) {
  const server = await createServer({
    configFile: false,
    root,
    plugins,
    resolve: { alias },
    define,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const mod = await server.ssrLoadModule("/src/landing/entry-server.tsx");
    if (typeof mod.render !== "function")
      throw new Error("src/landing/entry-server.tsx must export render()");
    return mod.render();
  } finally {
    await server.close();
  }
}

/**
 * Development only (`npm run dev`): with the landing page on, answer a page load of `/` with landing.html, so the dev
 * server shows what production shows. Every other path (/login, /dashboard, ...) is untouched and still gets the app.
 * With the landing page off this does nothing and `/` is the app, as in production.
 * @param {{ enabled: boolean }} options
 * @returns {import('vite').Plugin}
 */
export function landingDevRoot({ enabled }) {
  return {
    name: "sms-landing-dev-root",
    apply: "serve",
    configureServer(server) {
      if (!enabled) return;
      // Runs before Vite's own middleware, which then serves (and transforms) landing.html as if it had been asked for.
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? "").split("?");
        if (
          path === "/" &&
          req.method === "GET" &&
          (req.headers.accept ?? "").includes("text/html")
        )
          req.url = "/landing.html" + (query ? `?${query}` : "");
        next();
      });
    },
  };
}

/**
 * @param {{ enabled: boolean, root: string, ssrPlugins: import('vite').PluginOption[], alias: Record<string, string>, define: Record<string, string> }} options
 * @returns {import('vite').Plugin}
 */
export function landingBuild({ enabled, root, ssrPlugins, alias, define }) {
  return {
    name: "sms-landing-build",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const app = bundle["index.html"];
      if (!app || app.type !== "asset")
        this.error(
          "landing build: the built index.html (the app shell) is missing",
        );
      this.emitFile({
        type: "asset",
        fileName: "app.html",
        source: app.source,
      });
      if (!enabled) return;

      const landing = bundle["landing.html"];
      if (!landing || landing.type !== "asset")
        this.error(
          "landing build: VITE_LANDING_ENABLED is on but landing.html was not built",
        );
      // Drop landing.html's own comments (notes for developers) so they never ship in the public page source; the slot
      // comment is kept until the markup replaces it.
      const template = String(landing.source).replace(
        /<!--(?!landing-prerender-->)[\s\S]*?-->\s*/g,
        "",
      );
      if (!template.includes(LANDING_SLOT))
        this.error(`landing build: landing.html has no ${LANDING_SLOT}`);
      const markup = await renderLanding({
        root,
        plugins: ssrPlugins,
        alias,
        define,
      });
      app.source = template.replace(LANDING_SLOT, markup);
      delete bundle["landing.html"];
    },
  };
}
