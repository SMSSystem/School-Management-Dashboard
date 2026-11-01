import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkConsistency, parseChangelog, type RetroVersion } from '../../../scripts/versionLogic.mjs';

// The version is written in package.json, twice in package-lock.json and in CHANGELOG.md at the
// repository root. Change it only with `npm run version:bump` (docs/VERSIONING.md); this fails when
// the places disagree, so drift shows up in `npm test` before a pull request is opened.

const appDir = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(appDir, path), 'utf8');
const readJson = <T>(path: string) => JSON.parse(read(path)) as T;

describe('version files', () => {
  const changelog = read('../CHANGELOG.md');
  const retroVersions = readJson<RetroVersion[]>('scripts/retro-versions.json');

  it('agree with each other and with the retroactive versions', () => {
    const problems = checkConsistency({
      packageJson: readJson('package.json'),
      packageLock: readJson('package-lock.json'),
      changelog,
      retroVersions,
      today: new Date().toLocaleDateString('en-CA'),
    });
    expect(problems).toEqual([]);
  });

  it('record each retroactive version once, oldest first, on a distinct commit', () => {
    const commits = retroVersions.map((r) => r.commit);
    expect(new Set(commits).size).toBe(commits.length);
    for (const r of retroVersions) expect(r.commit, r.version).toMatch(/^[0-9a-f]{40}$/);
    const versions = parseChangelog(changelog).entries.map((e) => e.version);
    const retro = retroVersions.map((r) => r.version).reverse();
    // the CHANGELOG lists newest first; the retroactive part is its tail
    expect(versions.slice(versions.length - retro.length)).toEqual(retro);
  });
});
