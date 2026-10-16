import { describe, expect, it } from 'vitest';
import vercelRaw from '../../../vercel.json?raw';

// vercel.json sends every unknown path to the single-page app. Vercel serves real files first and
// applies a rewrite only when no file matches, so without an exception a missing hashed file such
// as /assets/index-abc123.js (a tab left open across a deploy asks for one) came back as index.html
// with status 200, which the browser then failed to run ("Unexpected token <"). Excluding /assets
// makes it a plain 404, which Vite reports as vite:preloadError (see src/lib/chunkReload.ts).

type Rewrite = { source: string; destination: string };
const config = JSON.parse(vercelRaw) as { rewrites: Rewrite[] };
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
