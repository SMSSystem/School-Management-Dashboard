import { describe, expect, it } from 'vitest';
import htmlRaw from '../../../index.html?raw';
import firebaseRaw from '../firebase.ts?raw';

// index.html opens the connections the app's first Firebase calls need while the app downloads;
// pinned so the list is not lost or widened by accident.

const norm = (s: string) => s.split('\r\n').join('\n');
const html = norm(htmlRaw);

type Hint = { rel: string; href: string; crossorigin: boolean };
const hints: Hint[] = [...html.matchAll(/<link rel="(preconnect|dns-prefetch)" href="(https:\/\/[^"]+)"( crossorigin)?\s*\/>/g)].map(
  (m) => ({ rel: m[1], href: m[2], crossorigin: m[3] !== undefined }),
);

describe('index.html connection hints', () => {
  it('lists exactly the hosts the first Firebase calls use, with the attributes that make the early connection usable', () => {
    // crossorigin must match the request's credentials mode or Chrome opens a second connection (see index.html)
    expect(hints.map((h) => `${h.rel} ${h.href}${h.crossorigin ? ' crossorigin' : ''}`)).toEqual([
      'preconnect https://www.google.com', // reCAPTCHA api.js: a plain script
      'preconnect https://www.gstatic.com crossorigin', // recaptcha__en.js: crossorigin="anonymous"
      'preconnect https://content-firebaseappcheck.googleapis.com crossorigin', // fetch, no credentials
      'preconnect https://firestore.googleapis.com', // WebChannel sends credentials (supportsCrossDomainXhr)
      'dns-prefetch https://identitytoolkit.googleapis.com', // reuses the App Check connection
      'dns-prefetch https://securetoken.googleapis.com',
      'dns-prefetch https://firebasestorage.googleapis.com',
    ]);
  });

  it('opens only a handful of connections early (browsers keep few, and each one costs the device)', () => {
    expect(hints.filter((h) => h.rel === 'preconnect').length).toBeLessThanOrEqual(4);
  });

  it('only names Google and Firebase hosts, never a new third party', () => {
    for (const h of hints) {
      expect(h.href, h.href).toMatch(/^https:\/\/(www\.google\.com|www\.gstatic\.com|[a-z-]+\.googleapis\.com)$/);
    }
  });

  it('is backed by the app really using App Check with reCAPTCHA (the reason the first hosts are there)', () => {
    expect(norm(firebaseRaw)).toContain('new ReCaptchaV3Provider(');
  });
});
