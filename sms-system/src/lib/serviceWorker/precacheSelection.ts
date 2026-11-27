// Which built files the service worker keeps on the device (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md,
// slice E): the page itself, the app's core code, and the two attendance registers' code with what they need offline
// (OFFLINE_MODULES), so a signed-in tab can reload and open a register offline. Every other page is loaded on demand and stays online-only, which keeps the
// download small. Used by vite.config.ts at build time, so no browser or Firebase import.
//
// Built chunks are hashed and many are called `index-*.js`, so files can't be chosen by name. Vite's own build
// manifest (`build.manifest`) says which source module each file came from and what it imports, which is reliable.

/** One entry of Vite's `.vite/manifest.json`. */
export type ViteManifestChunk = {
  file: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
  assets?: string[];
};

export type ViteManifest = Record<string, ViteManifestChunk>;

/** The register pages, as `routes/lazyPages.ts` loads them. */
export const REGISTER_MODULES = [
  "src/scenes/(dashboard)/attendance/general/index.tsx",
  "src/scenes/(dashboard)/attendance/subject/index.tsx",
] as const;

/**
 * The register pages plus the two on-demand pieces they need offline: the header's unsent-work tray
 * (components/attendance/HeaderOutbox.tsx) and the Realtime Database code that the account's single-session check
 * loads at every start (lib/sessionLock.ts). The database is matched by pattern, since its key is a path inside
 * node_modules that a Firebase update can move.
 */
const OFFLINE_MODULES: readonly (string | RegExp)[] = [
  ...REGISTER_MODULES,
  "src/components/attendance/OutboxTray.tsx",
  /^node_modules\/(?:@firebase|firebase)\/database\/.*\.js$/,
];

/**
 * The app shell. The build always writes it twice: as `index.html` and as `app.html` (scripts/landingBuild.mjs).
 * Page loads inside the app are answered with `app.html` (src/sw.ts), so they keep working when the landing page
 * takes over `index.html` (VITE_LANDING_ENABLED, docs/miscellaneous-specs/LANDING_PAGE_SPEC.md).
 */
export const APP_SHELL = "app.html";

/**
 * The landing page's HTML entry in Vite's build manifest; present only when VITE_LANDING_ENABLED is "true". Its
 * JavaScript is not kept (the page is prerendered and reads fine without it); its stylesheet is, so `/` still looks
 * right when it is opened offline.
 */
export const LANDING_ENTRY = "landing.html";

/** Files from `public/` kept too: the lock screen and the sign-in page show the logo, and the tab its icon. */
export const PUBLIC_FILES = [
  "logo.png",
  "favicon.ico",
  "favicon-16x16.png",
  "favicon-32x32.png",
] as const;

/** The manifest keys a root names: itself, or every key a pattern matches. Throws when there are none. */
function keysFor(manifest: ViteManifest, root: string | RegExp): string[] {
  const keys =
    typeof root === "string"
      ? [root].filter((key) => key in manifest)
      : Object.keys(manifest).filter((key) => root.test(key));
  if (keys.length === 0)
    throw new Error(`precache: "${String(root)}" is not in the build manifest`);
  return keys;
}

/**
 * The files to keep: the app's HTML entry and the offline modules, each with everything they import statically
 * (recursively) and their CSS, plus PUBLIC_FILES. Anything else reached only through a dynamic import is left out.
 * Throws when the entry or a module is missing, so a renamed page fails the build instead of silently not working
 * offline.
 */
export function selectPrecache(
  manifest: ViteManifest,
  offlineModules: readonly (string | RegExp)[] = OFFLINE_MODULES,
): Set<string> {
  const files = new Set<string>(PUBLIC_FILES);
  const seen = new Set<string>();
  const visit = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk)
      throw new Error(`precache: "${key}" is not in the build manifest`);
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  const entries = Object.keys(manifest).filter(
    (key) => manifest[key].isEntry && key !== LANDING_ENTRY,
  );
  if (entries.length === 0)
    throw new Error("precache: the build manifest has no entry");
  entries.forEach(visit);
  for (const root of offlineModules) keysFor(manifest, root).forEach(visit);
  for (const css of manifest[LANDING_ENTRY]?.css ?? []) files.add(css);
  // `/` (the app, or the landing page when it is on) and the app shell every other page load is answered with.
  files.add("index.html");
  files.add(APP_SHELL);
  return files;
}
