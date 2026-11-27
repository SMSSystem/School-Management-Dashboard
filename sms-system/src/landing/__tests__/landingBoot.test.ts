import { describe, expect, it, vi } from "vitest";
import bootSrc from "../../../public/landing-boot.js?raw";

// public/landing-boot.js runs before the landing page paints (landing.html). It is plain JavaScript served as-is, so it
// is run here against stand-in browser objects: theme choice, the `js` class, and the signed-in redirect.

type Store = Record<string, string>;

function run({
  local = {},
  session = {},
  dark = false,
}: { local?: Store; session?: Store; dark?: boolean } = {}) {
  const classes = new Set<string>();
  const attrs: Record<string, string> = {};
  const listeners: Array<() => void> = [];
  const media = {
    matches: dark,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
  };
  const makeStore = (data: Store) => ({
    get length() {
      return Object.keys(data).length;
    },
    key: (i: number) => Object.keys(data)[i] ?? null,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
  });
  const replace = vi.fn();
  const events: string[] = [];
  const win = {
    matchMedia: () => media,
    localStorage: makeStore(local),
    sessionStorage: makeStore(session),
    location: { replace },
    CustomEvent: class {
      constructor(public type: string) {}
    },
    dispatchEvent: (e: { type: string }) => events.push(e.type),
  } as unknown as Window & {
    landingTheme: { read: () => string; set: (p: string) => void };
  };
  const doc = {
    documentElement: {
      classList: {
        add: (c: string) => classes.add(c),
        toggle: (c: string, on: boolean) =>
          on ? classes.add(c) : classes.delete(c),
      },
      setAttribute: (k: string, v: string) => {
        attrs[k] = v;
      },
    },
  };
  // The file is an IIFE over (window, document); run its body with our stand-ins.
  new Function("window", "document", bootSrc)(win, doc);
  return { classes, attrs, replace, win, local, events, media, listeners };
}

describe("landing boot script", () => {
  it("marks the page as having JavaScript and follows the device theme by default", () => {
    const light = run();
    expect(light.classes.has("js")).toBe(true);
    expect(light.classes.has("dark")).toBe(false);
    expect(light.attrs["data-theme-pref"]).toBe("system");
    expect(run({ dark: true }).classes.has("dark")).toBe(true);
  });

  it("applies a saved choice before paint, under its own key (never the dashboard's 'theme')", () => {
    expect(
      run({ local: { "landing-theme": "dark" } }).classes.has("dark"),
    ).toBe(true);
    expect(
      run({ local: { "landing-theme": "light" }, dark: true }).classes.has(
        "dark",
      ),
    ).toBe(false);
    expect(run({ local: { theme: "dark" } }).classes.has("dark")).toBe(false);
    expect(
      run({ local: { "landing-theme": "nonsense" } }).attrs["data-theme-pref"],
    ).toBe("system");
  });

  it("saves a choice, forgets it on 'system', and tells the page", () => {
    const r = run();
    r.win.landingTheme.set("dark");
    expect(r.local["landing-theme"]).toBe("dark");
    expect(r.classes.has("dark")).toBe(true);
    r.win.landingTheme.set("system");
    expect("landing-theme" in r.local).toBe(false);
    expect(r.events).toContain("landing-theme-change");
  });

  it("follows the device when it switches, while the choice is 'system'", () => {
    const r = run();
    r.media.matches = true;
    r.listeners.forEach((fn) => fn());
    expect(r.classes.has("dark")).toBe(true);
  });

  it("sends a signed-in visitor to /login, checking only Firebase's session key", () => {
    const signedIn = run({
      session: { "firebase:authUser:abc:[DEFAULT]": "{}" },
    });
    expect(signedIn.replace).toHaveBeenCalledWith("/login");
    expect(signedIn.classes.has("js")).toBe(false);
    expect(run({ session: { other: "x" } }).replace).not.toHaveBeenCalled();
    // A key in localStorage is not a session of this tab (the app uses sessionStorage persistence).
    expect(
      run({ local: { "firebase:authUser:abc:[DEFAULT]": "{}" } }).replace,
    ).not.toHaveBeenCalled();
  });
});
