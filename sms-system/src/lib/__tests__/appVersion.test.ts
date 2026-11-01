import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_VERSION, buildDescription, displayVersion } from '../appVersion';

describe('appVersion', () => {
  it('is the version in package.json (passed in by vite.config.ts define)', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('shows the bare release in production and adds the build elsewhere', () => {
    expect(displayVersion('production', '2.39.0', 'a1b2c3d')).toBe('v2.39.0');
    expect(displayVersion('preview', '2.39.0', 'a1b2c3d')).toBe('v2.39.0+a1b2c3d');
    expect(displayVersion('development', '2.39.0', 'local')).toBe('v2.39.0+local');
    expect(buildDescription('production', '2.39.0', 'a1b2c3d')).toBe('v2.39.0 · build a1b2c3d · production');
  });
});
