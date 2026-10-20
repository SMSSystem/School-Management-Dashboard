import { describe, expect, it } from 'vitest';
import vercelRaw from '../../../vercel.json?raw';
import indexHtmlRaw from '../../../index.html?raw';

// vercel.json sends every unknown path to the single-page app. Vercel serves real files first and
// applies a rewrite only when no file matches, so without an exception a missing hashed file such
// as /assets/index-abc123.js (a tab left open across a deploy asks for one) came back as index.html
// with status 200, which the browser then failed to run ("Unexpected token <"). Excluding /assets
// makes it a plain 404, which Vite reports as vite:preloadError (see src/lib/chunkReload.ts).

type Rewrite = { source: string; destination: string };
type HeaderRule = { source: string; headers: { key: string; value: string }[] };
const config = JSON.parse(vercelRaw) as { rewrites: Rewrite[]; headers: HeaderRule[] };
const spa = config.rewrites[0];
const matches = (path: string) => new RegExp('^' + spa.source + '$').test(path);

describe('vercel.json single-page-app rewrite', () => {
  it('has one rewrite, to the app shell', () => {
    expect(config.rewrites).toHaveLength(1);
    expect(spa.destination).toBe('/');
  });

  it('still sends app routes to the shell', () => {
    for (const path of ['/', '/login', '/login/inst1/student', '/register/inst1', '/dashboard', '/dashboard/list/teachers', '/change-password']) {
      expect(matches(path), path).toBe(true);
    }
  });

  it('does not send a missing /assets file to the shell', () => {
    for (const path of ['/assets/index-abc123.js', '/assets/GridsheetPDFModal-DRNN3QaL.js', '/assets/index-DXPL-rZ3.css']) {
      expect(matches(path), path).toBe(false);
    }
  });
});

// Response headers (security report S-13, tightening plan F.11). The Content-Security-Policy is sent as
// REPORT-ONLY first: the browser reports what it would block and blocks nothing. Hobby has no log drain, so
// there is no collector; the owner reads the violations in the DevTools console of a deployed preview, and
// only then renames the header to Content-Security-Policy (and updates this test). The other headers enforce.
const rule = config.headers.find((r) => r.source === '/(.*)');
const header = (key: string) => rule?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
const csp = header('Content-Security-Policy-Report-Only') ?? '';
const directives = new Map(
  csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const [name, ...sources] = d.split(/\s+/);
      return [name, sources] as const;
    }),
);
const hostsOf = (name: string) => (directives.get(name) ?? []).filter((s) => /^(https|wss):/.test(s));

describe('vercel.json security headers', () => {
  it('has one rule, for every path, and still the single rewrite', () => {
    expect(config.headers).toHaveLength(1);
    expect(rule).toBeDefined();
    expect(config.rewrites).toHaveLength(1);
  });

  it('sends the policy as Report-Only and has no enforcing one yet', () => {
    expect(header('Content-Security-Policy-Report-Only')).toBeTruthy();
    expect(header('Content-Security-Policy')).toBeUndefined();
  });

  it('enforces the low-risk headers', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(header('Permissions-Policy')).toContain('camera=()');
    expect(header('Permissions-Policy')).toContain('microphone=()');
  });

  it('keeps the referrer policy the API key restriction needs (a stricter one would drop the Referer)', () => {
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('asks for HSTS without preload or subdomains (the app is on *.vercel.app)', () => {
    const hsts = header('Strict-Transport-Security') ?? '';
    expect(hsts).toMatch(/^max-age=\d+$/);
    expect(hsts).not.toMatch(/preload|includeSubDomains/);
  });
});

describe('the Content-Security-Policy', () => {
  it('denies by default and never allows eval or inline script', () => {
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(directives.get('script-src')).not.toContain("'unsafe-inline'");
    expect(directives.get('script-src')).toContain("'wasm-unsafe-eval'"); // the PDF engine's layout code
    expect(csp).not.toMatch(/(^|\s)https:(\s|;|$)/); // no bare https: source anywhere
    expect(csp).not.toContain('*.vercel.app');
  });

  it('forbids framing, plugins and a changed base', () => {
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
  });

  it('lets the app talk to every host it calls: Firestore, Auth, App Check, the Realtime Database and EmailJS', () => {
    const connect = hostsOf('connect-src');
    for (const host of [
      'https://firestore.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://content-firebaseappcheck.googleapis.com',
      'https://*.firebaseio.com',
      'wss://*.firebaseio.com',
      'https://api.emailjs.com',
    ]) {
      expect(connect, host).toContain(host);
    }
  });

  it('covers the hosts index.html opens early (the connection hints), so a hint never points at a blocked host', () => {
    const early = [...indexHtmlRaw.matchAll(/<link rel="(?:preconnect|dns-prefetch)" href="(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(early.length).toBeGreaterThan(3);
    const allowed = [...directives.values()].flat();
    const covered = (host: string) =>
      allowed.some((src) => src === host || src.startsWith(host + '/')) || host === 'https://firebasestorage.googleapis.com';
    // www.google.com and www.gstatic.com are named by path (the reCAPTCHA scripts); firebasestorage is only a DNS hint
    for (const host of early) expect(covered(host), host).toBe(true);
  });

  it('allows scripts only from this origin and the reCAPTCHA script hosts', () => {
    expect(hostsOf('script-src')).toEqual(['https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/']);
  });

  it("allows images from this origin, data and blob URLs and the one reCAPTCHA pixel, not from any host", () => {
    expect(directives.get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'https://www.google.com/images/cleardot.gif']);
  });

  it("lets pages frame Vercel's preview toolbar, and names vercel.live in no other directive", () => {
    // Vercel injects its feedback toolbar into preview deployments only; the production domain never loads it
    expect(hostsOf('frame-src')).toContain('https://vercel.live');
    for (const [name, sources] of directives) {
      if (name !== 'frame-src') expect(sources.join(' '), name).not.toContain('vercel.live');
    }
  });

  it('names only Google, Firebase, EmailJS and Vercel-toolbar hosts', () => {
    for (const src of [...directives.values()].flat().filter((s) => /^(https|wss):/.test(s))) {
      expect(src, src).toMatch(
        /^(https|wss):\/\/(www\.google\.com|www\.gstatic\.com|recaptcha\.google\.com|api\.emailjs\.com|\*\.firebaseio\.com|vercel\.live|[a-z-]+\.googleapis\.com)(\/|$)/,
      );
    }
  });
});
