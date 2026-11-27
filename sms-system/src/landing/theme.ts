// The landing page's theme, shared by every theme switch on the page. The source of truth is public/landing-boot.js,
// which applies the theme before the first paint and exposes `window.landingTheme`; this file only subscribes to it,
// so two switches (header and menu) never disagree. Never touches the dashboard's own theme (src/lib/theme.ts).
import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export const THEME_PREFS: readonly ThemePref[] = ["system", "light", "dark"];

declare global {
  interface Window {
    landingTheme?: { read: () => ThemePref; set: (pref: ThemePref) => void };
  }
}

const EVENT = "landing-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const read = (): ThemePref => window.landingTheme?.read() ?? "system";

/**
 * The current preference. During prerendering and hydration it is "system", so the HTML the build wrote and the first
 * browser render match; React then re-renders with the stored value.
 */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, read, () => "system");
}

export function setThemePref(pref: ThemePref) {
  window.landingTheme?.set(pref);
}
