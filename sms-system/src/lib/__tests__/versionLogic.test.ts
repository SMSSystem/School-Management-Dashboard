import { describe, expect, it } from 'vitest';
import {
  applyRelease,
  bumpVersion,
  checkAgainstBase,
  checkConsistency,
  compareVersions,
  extractEntry,
  isShippedPath,
  parseChangelog,
  parseVersion,
  planRetroTags,
  renderEntry,
  renderPrLinks,
} from '../../../scripts/versionLogic.mjs';

const REPO = 'https://example.test/repo';

const changelog = (unreleased = '_Nothing yet._') =>
  [
    '# Changelog',
    '',
    '**Current version:** v2.1.0 · **Last updated:** 2026-10-02',
    '',
    '## Unreleased',
    '',
    unreleased,
    '',
    '## 2.x — nested data',
    '',
    renderEntry({ version: '2.1.0', date: '2026-10-02', title: 'Second', prs: [2], body: '**Added**\n- B', open: true, repoUrl: REPO }),
    '',
    renderEntry({ version: '2.0.0', date: '2026-10-01', title: 'First', prs: [1], body: '**Breaking**\n- A', repoUrl: REPO }),
    '',
    '## 1.x — flat data',
    '',
    renderEntry({ version: '1.0.0', date: '2026-06-02', title: 'MVP', body: '**Added**\n- C', repoUrl: REPO }),
    '',
  ].join('\n');

const pkg = (v: string) => ({ packageJson: { version: v }, packageLock: { version: v, packages: { '': { version: v } } } });

describe('parseVersion and compareVersions', () => {
  it('accepts SemVer and rejects a "v" prefix or two parts', () => {
    expect(parseVersion('2.38.0')).toMatchObject({ major: 2, minor: 38, patch: 0 });
    expect(parseVersion('1.0.0-rc.1+abc')).toMatchObject({ prerelease: ['rc', '1'], build: 'abc' });
    for (const bad of ['v2.38.0', '2.38', '02.1.0', '1.0.0-', '']) expect(parseVersion(bad), bad).toBeNull();
  });

  it('orders by SemVer precedence', () => {
    const sorted = ['1.0.0', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-beta', '1.0.0-alpha.beta', '1.0.0-rc.1', '1.0.0-beta.11', '1.0.0-beta.2', '2.10.0', '2.9.0'];
    sorted.sort(compareVersions);
    expect(sorted).toEqual(['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '2.9.0', '2.10.0']);
    expect(compareVersions('1.0.0+a', '1.0.0+b')).toBe(0);
  });

  it('bumps each part and resets the lower ones', () => {
    expect(bumpVersion('2.38.4', 'major')).toBe('3.0.0');
    expect(bumpVersion('2.38.4', 'minor')).toBe('2.39.0');
    expect(bumpVersion('2.38.4', 'patch')).toBe('2.38.5');
    expect(() => bumpVersion('2.38.4', 'huge')).toThrow();
  });
});

describe('CHANGELOG parsing and rendering', () => {
  it('reads the header, Unreleased and each entry with its era', () => {
    const log = parseChangelog(changelog('- pending'));
    expect(log.currentVersion).toBe('2.1.0');
    expect(log.lastUpdated).toBe('2026-10-02');
    expect(log.unreleased).toBe('- pending');
    expect(log.entries.map((e) => [e.version, e.era, e.open])).toEqual([
      ['2.1.0', 2, true],
      ['2.0.0', 2, false],
      ['1.0.0', 1, false],
    ]);
  });

  it('reads a CRLF file the same way', () => {
    expect(parseChangelog(changelog().replace(/\n/g, '\r\n')).entries).toHaveLength(3);
  });

  it('keeps a blank line after </summary> so GitHub renders the bullets', () => {
    expect(renderEntry({ version: '1.2.3', date: '2026-01-01', title: 'T', body: '- x' })).toMatch(/<\/summary>\n\n- x\n\n<\/details>$/);
  });

  it('links pull requests, as a range when three or more are consecutive', () => {
    expect(renderPrLinks([], REPO)).toBe('');
    expect(renderPrLinks([89], REPO)).toBe(` (<a href="${REPO}/pull/89">#89</a>)`);
    expect(renderPrLinks([43, 35, 36, 37, 38, 39, 40, 41, 42], REPO)).toBe(` (<a href="${REPO}/pull/35">#35</a>–<a href="${REPO}/pull/43">#43</a>)`);
    expect(renderPrLinks([5, 9], REPO)).toContain('#5</a>, <a');
  });

  it('extracts one entry body for a release', () => {
    expect(extractEntry(changelog(), 'v2.0.0')).toBe('**Breaking**\n- A');
    expect(extractEntry(changelog(), '9.9.9')).toBeNull();
  });
});

describe('applyRelease', () => {
  it('moves Unreleased into a new open entry at the top of its era and closes the old one', () => {
    const out = applyRelease(changelog('**Fixed**\n- D'), { version: '2.1.1', date: '2026-10-05', title: 'Fix', prs: [3], repoUrl: REPO });
    const log = parseChangelog(out);
    expect(log.currentVersion).toBe('2.1.1');
    expect(log.lastUpdated).toBe('2026-10-05');
    expect(log.unreleased).toBe('_Nothing yet._');
    expect(log.entries.map((e) => [e.version, e.open, e.era])).toEqual([
      ['2.1.1', true, 2],
      ['2.1.0', false, 2],
      ['2.0.0', false, 2],
      ['1.0.0', false, 1],
    ]);
    expect(log.entries[0].body).toBe('**Fixed**\n- D');
    expect(checkConsistency({ ...pkg('2.1.1'), changelog: out, today: '2026-10-05' })).toEqual([]);
  });

  it('starts a new era heading for a major', () => {
    const out = applyRelease(changelog('**Breaking**\n- E'), { version: '3.0.0', date: '2026-10-05', title: 'Big', repoUrl: REPO });
    const log = parseChangelog(out);
    expect(log.eras).toEqual([3, 2, 1]);
    expect(log.entries[0]).toMatchObject({ version: '3.0.0', era: 3, open: true });
    expect(checkConsistency({ ...pkg('3.0.0'), changelog: out, today: '2026-10-05' })).toEqual([]);
  });

  it('keeps CRLF line endings', () => {
    const out = applyRelease(changelog('- F').replace(/\n/g, '\r\n'), { version: '2.2.0', date: '2026-10-05', title: 'T' });
    expect(out.includes('\r\n')).toBe(true);
    expect(/[^\r]\n/.test(out)).toBe(false);
  });

  it('refuses an empty Unreleased or a version that is not newer', () => {
    expect(() => applyRelease(changelog(), { version: '2.2.0', date: '2026-10-05', title: 'T' })).toThrow(/Unreleased/);
    expect(() => applyRelease(changelog('- G'), { version: '2.1.0', date: '2026-10-05', title: 'T' })).toThrow(/not newer/);
  });
});

describe('checkConsistency', () => {
  const ok = { ...pkg('2.1.0'), changelog: changelog(), today: '2026-10-31' };

  it('passes when everything agrees', () => {
    expect(checkConsistency(ok)).toEqual([]);
  });

  it('catches the lock file drifting from package.json', () => {
    const problems = checkConsistency({ ...ok, packageLock: { version: '2.0.0', packages: { '': { version: '2.1.0' } } } });
    expect(problems.join('\n')).toMatch(/package-lock.json version "2.0.0"/);
  });

  it('catches a package.json version that is not in the CHANGELOG', () => {
    expect(checkConsistency({ ...ok, ...pkg('2.2.0') }).join('\n')).toMatch(/current version is v2.1.0/);
  });

  it('catches duplicates, wrong order, a missing anchor, a second open entry and a wrong era', () => {
    const extra = renderEntry({ version: '2.1.0', date: '2026-10-02', title: 'Dup', body: '- x', open: true });
    const broken = changelog()
      .replace('## 1.x — flat data\n\n', `## 1.x — flat data\n\n${extra}\n\n`)
      .replace('<a id="v2.0.0"></a>\n', '');
    const text = checkConsistency({ ...ok, changelog: broken }).join('\n');
    expect(text).toMatch(/has v2.1.0 twice/);
    expect(text).toMatch(/v2.0.0 needs <a id="v2.0.0"><\/a>/);
    expect(text).toMatch(/v2.1.0 is open; only the newest entry is/);
    expect(text).toMatch(/v2.1.0 is not under the "## 2.x" heading/);
    expect(text).toMatch(/is listed above v2.1.0 but is not newer/);
  });

  it('catches dates in the future and a stale Last updated line', () => {
    expect(checkConsistency({ ...ok, today: '2026-10-01' }).join('\n')).toMatch(/in the future/);
    const stale = changelog().replace('**Last updated:** 2026-10-02', '**Last updated:** 2026-09-01');
    expect(checkConsistency({ ...ok, changelog: stale }).join('\n')).toMatch(/before the newest entry's date/);
  });

  it('checks the retroactive map against the entries', () => {
    const retro = [
      { version: '1.0.0', commit: 'a', date: '2026-06-02', prs: [16] },
      { version: '0.1.0', commit: 'b', date: '2026-05-14', prs: [11] },
      { version: '2.0.0', commit: 'c', date: '2026-08-03', prs: [34] },
    ];
    const text = checkConsistency({ ...ok, retroVersions: retro }).join('\n');
    expect(text).toMatch(/retro-versions.json has v0.1.0, CHANGELOG.md does not/);
    expect(text).toMatch(/v2.0.0 is dated 2026-10-01 in CHANGELOG.md but 2026-08-03/);
    expect(text).not.toMatch(/v1.0.0/);
  });
});

describe('what ships', () => {
  it('counts app code, rules, deploy config and scripts, not docs or tests', () => {
    for (const p of [
      'sms-system/src/lib/appVersion.ts',
      'sms-system/firestore.rules',
      'sms-system/vercel.json',
      'sms-system/package.json',
      'sms-system/scripts/version.mjs',
      'sms-system/public/favicon.ico',
    ]) {
      expect(isShippedPath(p), p).toBe(true);
    }
    for (const p of [
      'CHANGELOG.md',
      'sms-system/README.md',
      'sms-system/docs/VERSIONING.md',
      'sms-system/src/lib/__tests__/versionLogic.test.ts',
      'sms-system/e2e/01-login.spec.ts',
      'sms-system/scripts/versionLogic.d.mts',
      'sms-system/scripts/retro-versions.json',
      '.github/workflows/release.yml',
    ]) {
      expect(isShippedPath(p), p).toBe(false);
    }
  });

  it('asks for a bump only when shipped code changed', () => {
    expect(checkAgainstBase({ version: '2.38.0', baseVersion: '2.38.0', changedPaths: ['sms-system/docs/x.md'], tagExists: true })).toEqual([]);
    expect(checkAgainstBase({ version: '2.38.0', baseVersion: '2.38.0', changedPaths: ['sms-system/src/App.tsx'], tagExists: true }).join('')).toMatch(/version:bump/);
    expect(checkAgainstBase({ version: '2.39.0', baseVersion: '2.38.0', changedPaths: ['sms-system/src/App.tsx'], tagExists: false })).toEqual([]);
  });

  it('catches a version another merge already took', () => {
    expect(checkAgainstBase({ version: '2.39.0', baseVersion: '2.38.0', changedPaths: [], tagExists: true }).join('')).toMatch(/already exists/);
  });
});

describe('planRetroTags', () => {
  it('creates missing tags, skips matching ones and flags moved ones', () => {
    const retro = [
      { version: '0.0.1', commit: 'aaa', date: '2024-12-05', prs: [] },
      { version: '0.0.2', commit: 'bbb', date: '2025-01-04', prs: [] },
      { version: '0.0.3', commit: 'ccc', date: '2025-10-13', prs: [1] },
    ];
    const plan = planRetroTags(retro, new Map([['v0.0.2', 'bbb'], ['v0.0.3', 'zzz']]));
    expect(plan.map((r) => [r.tag, r.action])).toEqual([
      ['v0.0.1', 'create'],
      ['v0.0.2', 'skip'],
      ['v0.0.3', 'conflict'],
    ]);
  });
});
