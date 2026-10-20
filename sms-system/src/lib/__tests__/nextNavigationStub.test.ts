import { describe, expect, it } from 'vitest';
import viteConfigRaw from '../../../vite.config.ts?raw';
import nextAdapterRaw from '../../../node_modules/nextstepjs/dist/adapters/next/index.js?raw';
import { useRouter, usePathname, useSearchParams, useParams } from '../nextNavigationMock';

// nextstepjs's Next.js adapter imports useRouter and usePathname from `next/navigation`. The app uses the React Router
// adapter, but the production build still resolves that import: without the alias in vite.config.ts it fails with
// MISSING_EXPORT. (Found by a build after the stub had been deleted as "unused"; unit tests, tsc and eslint do not
// see it, only a build does.)

describe('the next/navigation stub', () => {
  it('is still needed: the installed nextstepjs imports useRouter and usePathname from next/navigation', () => {
    expect(nextAdapterRaw).toMatch(/import\s*\{\s*useRouter\s*,\s*usePathname\s*\}\s*from\s*['"]next\/navigation['"]/);
  });

  it('is aliased in vite.config.ts', () => {
    const config = viteConfigRaw.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
    expect(config).toContain("'next/navigation': path.resolve(__dirname, 'src/lib/nextNavigationMock.ts'),");
  });

  it('exports what the adapter asks for', () => {
    expect(useRouter().push).toBeTypeOf('function');
    expect(usePathname()).toBe('');
    expect(useSearchParams()).toBeInstanceOf(URLSearchParams);
    expect(useParams()).toEqual({});
  });
});
