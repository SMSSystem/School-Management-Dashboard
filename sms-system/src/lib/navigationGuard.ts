// The decisions behind the unsaved-changes guard, kept apart from the
// browser: which clicks on a link should ask before leaving, and what the history sentinel looks like. The app uses
// BrowserRouter, which cannot block a navigation, so a page that is dirty asks itself by watching clicks on links and the
// back button; the listeners live in the guard's provider, the rules live here so they can be tested without a browser.

export type LinkClick = {
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  /** The anchor's resolved address (anchor.href). */
  href: string;
  /** The anchor's target attribute ("" when none). */
  target: string;
  /** Does the anchor download a file? */
  download: boolean;
};

export type Here = { origin: string; path: string };

/**
 * Where a click on a link leads, when leaving should be confirmed first: a plain left click on a same-origin web link that
 * opens in this tab and goes to another page. Null for everything else (a new tab, a download, another site, mailto:, a
 * click already handled, a link to the same page or only to another place on it), which proceeds as usual.
 */
export function interceptTarget(click: LinkClick, here: Here): string | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  if (click.ctrlKey || click.metaKey || click.shiftKey || click.altKey || click.download) return null;
  if (click.target !== '' && click.target !== '_self') return null;
  let url: URL;
  try {
    url = new URL(click.href);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== here.origin) return null;
  if (url.pathname + url.search === here.path) return null;
  return url.pathname + url.search + url.hash;
}

/** The state of the extra history entry the guard pushes, so the back button lands on a page it can recognise. */
export const GUARD_STATE = { examGuard: true } as const;

export function isGuardState(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>).examGuard === true;
}

/** The router's own state with the sentinel marker added (its keys are kept). */
export function withGuardState(state: unknown): Record<string, unknown> {
  const own = typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
  return { ...own, ...GUARD_STATE };
}

/**
 * The browser went to another history entry. While the guard is on, arriving at an entry that is not the sentinel means the
 * user went back (ask first); arriving at the sentinel is the guard's own doing or a forward step (nothing to ask).
 */
export function popDecision(p: { guardActive: boolean; state: unknown }): 'ask' | 'ignore' {
  return p.guardActive && !isGuardState(p.state) ? 'ask' : 'ignore';
}
