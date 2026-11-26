/// <reference types="vite/client" />

// Set by vite.config.ts `define` at build time; read them through src/lib/appVersion.ts.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_ENV__: string;
declare const __BUILD_YEAR__: number;
// "remove" when the build is the service worker's safety switch (vite.config.ts); otherwise "on".
declare const __SW_MODE__: "on" | "remove";
