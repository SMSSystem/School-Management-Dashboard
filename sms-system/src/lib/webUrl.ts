// One place that decides what counts as a web address. Used by the lesson-note link check (lessonNoteLinks.ts), the
// unsaved-changes guard (navigationGuard.ts) and outside links (components/OutsideLink.tsx). Only http: and https:
// are web addresses: javascript:, data:, vbscript:, file:, mailto: and the like are never followed or stored as links.
// Pure and never throws, so it's safe on anything a person typed.

const WEB_PROTOCOLS = new Set(["http:", "https:"]);

/** The address as a URL, or null when it isn't one. A relative address needs `base`. */
export function parseUrl(href: string, base?: string): URL | null {
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

/** Whether a parsed address is a web address (http: or https:). */
export function isWebUrl(url: URL): boolean {
  return WEB_PROTOCOLS.has(url.protocol);
}

/** The address as a URL when it's a web address, otherwise null. */
export function parseWebUrl(href: string, base?: string): URL | null {
  const url = parseUrl(href, base);
  return url && isWebUrl(url) ? url : null;
}
