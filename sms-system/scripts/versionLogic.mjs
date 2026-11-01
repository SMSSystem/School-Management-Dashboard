// Pure decisions for scripts/version.mjs and scripts/tag-retro-versions.mjs (no I/O, so they can be
// unit tested from src/lib/__tests__/versionLogic.test.ts and run by versionConsistency.test.ts).
//
// The version lives in sms-system/package.json (bare, "2.39.0"). package-lock.json repeats it twice
// and CHANGELOG.md at the repository root records it as "v2.39.0" in its header line and in one
// <details> block per version. These functions keep those places in step; the rules for choosing a
// major, minor or patch bump are in docs/VERSIONING.md.

export const REPO_URL = 'https://github.com/SMSSystem/School-Management-Dashboard';

// The regular expression semver.org publishes for a SemVer 2.0.0 version (numbered capture groups).
export const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** { major, minor, patch, prerelease, build } or null when the text is not a SemVer version (a leading "v" is not). */
export function parseVersion(text) {
  const m = typeof text === 'string' ? SEMVER_RE.exec(text) : null;
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
    build: m[5] ?? null,
  };
}

const compareIdentifiers = (a, b) => {
  const an = /^\d+$/.test(a);
  const bn = /^\d+$/.test(b);
  if (an && bn) return Math.sign(Number(a) - Number(b));
  if (an) return -1; // numeric identifiers sort below alphanumeric ones
  if (bn) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

/** -1, 0 or 1 by SemVer precedence (build metadata ignored). Throws on an invalid version. */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`not a semantic version: ${!x ? a : b}`);
  for (const key of ['major', 'minor', 'patch']) {
    if (x[key] !== y[key]) return Math.sign(x[key] - y[key]);
  }
  // a pre-release sorts below the same version without one
  if (x.prerelease.length === 0 || y.prerelease.length === 0) {
    return Math.sign(y.prerelease.length - x.prerelease.length);
  }
  const n = Math.max(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < n; i++) {
    if (x.prerelease[i] === undefined) return -1;
    if (y.prerelease[i] === undefined) return 1;
    const c = compareIdentifiers(x.prerelease[i], y.prerelease[i]);
    if (c !== 0) return c;
  }
  return 0;
}

export const BUMP_KINDS = ['major', 'minor', 'patch'];

/** The next release version; any pre-release or build part of `version` is dropped. */
export function bumpVersion(version, kind) {
  const v = parseVersion(version);
  if (!v) throw new Error(`not a semantic version: ${version}`);
  if (kind === 'major') return `${v.major + 1}.0.0`;
  if (kind === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (kind === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;
  throw new Error(`bump kind must be one of ${BUMP_KINDS.join(', ')}, not "${kind}"`);
}

// ---------------------------------------------------------------------------------------------
// CHANGELOG.md
//
//   **Current version:** v2.39.0 · **Last updated:** 2026-11-01
//   ## Unreleased
//   ## 2.x — <era name> (...)
//   <a id="v2.39.0"></a>
//   <details open>
//   <summary><strong>v2.39.0</strong> · 2026-11-01 · Title (<a href=".../pull/90">#90</a>)</summary>
//
//   **Added**
//   - ...
//
//   </details>
//
// GitHub renders Markdown inside <details> only with a blank line after </summary>, and does not
// render Markdown links inside <summary>, so the summary uses HTML.
// ---------------------------------------------------------------------------------------------

const HEADER_RE = /^\*\*Current version:\*\* v(\S+) · \*\*Last updated:\*\* (\S+)$/m;
const ENTRY_RE =
  /(?:<a id="([^"]*)"><\/a>\n)?<details( open)?>\n<summary><strong>v([^<]+)<\/strong> · ([^ ]+) · (.*)<\/summary>\n\n([\s\S]*?)\n*<\/details>/g;
const UNRELEASED_RE = /^## Unreleased\n([\s\S]*?)(?=^## |(?![\s\S]))/m;
const EMPTY_UNRELEASED = '_Nothing yet._';

export const normalizeEol = (text) => text.replace(/\r\n/g, '\n');

/**
 * { currentVersion, lastUpdated, unreleased, eras, entries } where each entry is
 * { version, date, title, body, open, anchor, era, index } in file order (newest first).
 * `era` is the major number of the "## N.x" heading above the entry (null when there is none).
 */
export function parseChangelog(raw) {
  const text = normalizeEol(raw);
  const header = HEADER_RE.exec(text);
  const unreleasedMatch = UNRELEASED_RE.exec(text);
  const eras = [...text.matchAll(/^## (\d+)\.x\b.*$/gm)].map((m) => ({ major: Number(m[1]), index: m.index }));
  const entries = [...text.matchAll(ENTRY_RE)].map((m) => {
    const era = eras.filter((e) => e.index < m.index).at(-1);
    return {
      anchor: m[1] ?? null,
      open: Boolean(m[2]),
      version: m[3],
      date: m[4],
      title: m[5],
      body: m[6].trim(),
      era: era ? era.major : null,
      index: m.index,
    };
  });
  return {
    currentVersion: header ? header[1] : null,
    lastUpdated: header ? header[2] : null,
    unreleased: unreleasedMatch ? unreleasedMatch[1].trim() : null,
    eras: eras.map((e) => e.major),
    entries,
  };
}

/** The body of one version's entry (what a GitHub Release shows), or null when it is not there. */
export function extractEntry(raw, version) {
  const bare = version.replace(/^v/, '');
  const entry = parseChangelog(raw).entries.find((e) => e.version === bare);
  return entry ? entry.body : null;
}

/** "(<a>#89</a>)", a range "#35–#43" for three or more consecutive PRs, or "" without any. */
export function renderPrLinks(prs, repoUrl = REPO_URL) {
  if (!prs || prs.length === 0) return '';
  const link = (n) => `<a href="${repoUrl}/pull/${n}">#${n}</a>`;
  const sorted = [...prs].sort((a, b) => a - b);
  const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  if (sorted.length >= 3 && consecutive) return ` (${link(sorted[0])}–${link(sorted.at(-1))})`;
  return ` (${sorted.map(link).join(', ')})`;
}

/** One version's block, without a trailing newline. */
export function renderEntry({ version, date, title, prs = [], body, open = false, repoUrl = REPO_URL }) {
  return [
    `<a id="v${version}"></a>`,
    `<details${open ? ' open' : ''}>`,
    `<summary><strong>v${version}</strong> · ${date} · ${title}${renderPrLinks(prs, repoUrl)}</summary>`,
    '',
    body.trim(),
    '',
    '</details>',
  ].join('\n');
}

export const renderHeaderLine = (version, date) => `**Current version:** v${version} · **Last updated:** ${date}`;

/**
 * The CHANGELOG after a release: the Unreleased bullets become the new version's entry (open, at the
 * top of its era, with a new "## N.x" heading for a new major), the previous entry is closed, the
 * header line names the new version and date, and Unreleased is emptied. Throws when Unreleased
 * has nothing to release or the version is not newer than the top entry.
 */
export function applyRelease(raw, { version, date, title, prs = [], repoUrl = REPO_URL }) {
  const usesCrlf = raw.includes('\r\n');
  let text = normalizeEol(raw);
  const parsed = parseChangelog(text);
  if (!parsed.unreleased || parsed.unreleased === EMPTY_UNRELEASED) {
    throw new Error('the Unreleased section is empty: write the changes there first');
  }
  const top = parsed.entries[0];
  if (top && compareVersions(version, top.version) <= 0) {
    throw new Error(`v${version} is not newer than the latest entry, v${top.version}`);
  }
  if (!HEADER_RE.test(text)) throw new Error('the "**Current version:** ... · **Last updated:** ..." line is missing');

  // close every open entry
  text = text.replace(/<details open>/g, '<details>');
  text = text.replace(HEADER_RE, renderHeaderLine(version, date));
  text = text.replace(UNRELEASED_RE, `## Unreleased\n\n${EMPTY_UNRELEASED}\n\n`);

  const entry = renderEntry({ version, date, title, prs, body: parsed.unreleased, open: true, repoUrl });
  const major = parseVersion(version).major;
  const eraHeading = new RegExp(`^## ${major}\\.x\\b.*\\n`, 'm').exec(text);
  if (eraHeading) {
    const at = eraHeading.index + eraHeading[0].length;
    text = `${text.slice(0, at)}\n${entry}\n${text.slice(at).replace(/^\n*/, '\n')}`;
  } else {
    // a new major: its era heading goes right after Unreleased, above the previous era
    const next = /^## (?!Unreleased)/m.exec(text);
    const block = `## ${major}.x\n\n${entry}\n\n`;
    text = next ? `${text.slice(0, next.index)}${block}${text.slice(next.index)}` : `${text.trimEnd()}\n\n${block}`;
  }
  return usesCrlf ? text.replace(/\n/g, '\r\n') : text;
}

// ---------------------------------------------------------------------------------------------
// Consistency
// ---------------------------------------------------------------------------------------------

/**
 * Every way the version files can disagree, as plain sentences (empty when they agree).
 *   packageJson, packageLock: parsed JSON; changelog: the CHANGELOG text;
 *   retroVersions: scripts/retro-versions.json (optional); today: "YYYY-MM-DD".
 */
export function checkConsistency({ packageJson, packageLock, changelog, retroVersions = [], today }) {
  const problems = [];
  const version = packageJson?.version;
  if (!parseVersion(version)) problems.push(`package.json version "${version}" is not a semantic version`);
  if (packageLock?.version !== version) {
    problems.push(`package-lock.json version "${packageLock?.version}" does not match package.json "${version}"`);
  }
  const lockRoot = packageLock?.packages?.['']?.version;
  if (lockRoot !== version) {
    problems.push(`package-lock.json packages[""].version "${lockRoot}" does not match package.json "${version}"`);
  }

  const log = parseChangelog(changelog);
  if (log.currentVersion === null) problems.push('CHANGELOG.md has no "**Current version:** ... · **Last updated:** ..." line');
  else if (log.currentVersion !== version) {
    problems.push(`CHANGELOG.md says the current version is v${log.currentVersion}, package.json says ${version}`);
  }
  if (log.unreleased === null) problems.push('CHANGELOG.md has no "## Unreleased" section');
  if (log.entries.length === 0) problems.push('CHANGELOG.md has no version entries');

  const top = log.entries[0];
  if (top && top.version !== version) {
    problems.push(`the newest CHANGELOG.md entry is v${top.version}, package.json says ${version}`);
  }
  if (log.lastUpdated !== null) {
    if (!DATE_RE.test(log.lastUpdated)) problems.push(`"Last updated" ${log.lastUpdated} is not YYYY-MM-DD`);
    else {
      if (top && log.lastUpdated < top.date) problems.push(`"Last updated" ${log.lastUpdated} is before the newest entry's date ${top.date}`);
      if (today && log.lastUpdated > today) problems.push(`"Last updated" ${log.lastUpdated} is in the future`);
    }
  }

  const seen = new Set();
  log.entries.forEach((e, i) => {
    const name = `v${e.version}`;
    if (!parseVersion(e.version)) problems.push(`CHANGELOG.md entry "${name}" is not a semantic version`);
    if (seen.has(e.version)) problems.push(`CHANGELOG.md has ${name} twice`);
    seen.add(e.version);
    if (e.anchor !== name) problems.push(`${name} needs <a id="${name}"></a> on the line above its <details>`);
    if (!DATE_RE.test(e.date)) problems.push(`${name} date "${e.date}" is not YYYY-MM-DD`);
    else if (today && e.date > today) problems.push(`${name} is dated in the future (${e.date})`);
    if (e.open !== (i === 0)) {
      problems.push(i === 0 ? `the newest entry, ${name}, should be <details open>` : `${name} is open; only the newest entry is`);
    }
    if (!e.body) problems.push(`${name} has no bullets`);
    const major = parseVersion(e.version)?.major;
    if (major !== undefined && e.era !== major) problems.push(`${name} is not under the "## ${major}.x" heading`);
    const prev = log.entries[i - 1];
    if (prev && parseVersion(prev.version) && parseVersion(e.version)) {
      if (compareVersions(prev.version, e.version) <= 0) problems.push(`v${prev.version} is listed above ${name} but is not newer`);
      if (DATE_RE.test(prev.date) && DATE_RE.test(e.date) && prev.date < e.date) {
        problems.push(`v${prev.version} (${prev.date}) is listed above ${name} (${e.date}) but is older`);
      }
    }
  });

  for (const r of retroVersions) {
    const entry = log.entries.find((e) => e.version === r.version);
    if (!entry) problems.push(`retro-versions.json has v${r.version}, CHANGELOG.md does not`);
    else if (entry.date !== r.date) problems.push(`v${r.version} is dated ${entry.date} in CHANGELOG.md but ${r.date} in retro-versions.json`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Which changes ship (and so need a new version)
// ---------------------------------------------------------------------------------------------

// Paths are relative to the repository root, with forward slashes. What Vercel builds, what the
// Firebase CLI deploys and the admin scripts' interfaces ship; docs, tests and tooling do not.
const SHIPPED = [
  /^sms-system\/src\//,
  /^sms-system\/public\//,
  /^sms-system\/index\.html$/,
  /^sms-system\/(firestore\.rules|database\.rules\.json|firestore\.indexes\.json|firebase\.json)$/,
  /^sms-system\/(vercel\.json|vite\.config\.ts|postcss\.config\.ts|tsconfig(\.app|\.node)?\.json)$/,
  /^sms-system\/package(-lock)?\.json$/,
  /^sms-system\/scripts\/[^/]+\.(mjs|ps1)$/,
];
const NOT_SHIPPED = [/\/__tests__\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /\.d\.mts$/];

export function isShippedPath(path) {
  const p = path.replace(/\\/g, '/');
  return SHIPPED.some((re) => re.test(p)) && !NOT_SHIPPED.some((re) => re.test(p));
}

/**
 * Problems with a branch's version compared with the branch it merges into.
 *   changedPaths: `git diff --name-only base...HEAD`; baseVersion: package.json version on base;
 *   tagExists: whether tag v<version> already exists.
 */
export function checkAgainstBase({ version, baseVersion, changedPaths, tagExists }) {
  const problems = [];
  const shipped = changedPaths.filter(isShippedPath);
  const bumped = parseVersion(version) && parseVersion(baseVersion) && compareVersions(version, baseVersion) > 0;
  if (shipped.length > 0 && !bumped) {
    const sample = shipped.slice(0, 5).join(', ') + (shipped.length > 5 ? ', ...' : '');
    problems.push(
      `this branch changes code that ships (${sample}) but the version is still ${version} (base ${baseVersion}); ` +
        'run "npm run version:bump -- <major|minor|patch>" (see docs/VERSIONING.md)',
    );
  }
  if (bumped && tagExists) problems.push(`tag v${version} already exists: another merge took this version, bump again`);
  if (parseVersion(version) && parseVersion(baseVersion) && compareVersions(version, baseVersion) < 0) {
    problems.push(`the version went down, from ${baseVersion} to ${version}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Retroactive tags
// ---------------------------------------------------------------------------------------------

/**
 * What tag-retro-versions.mjs does for each entry of retro-versions.json.
 *   existingTags: Map of tag name -> commit it points to.
 * Each row is { tag, commit, date, action: 'create' | 'skip' | 'conflict' }.
 */
export function planRetroTags(retroVersions, existingTags) {
  return retroVersions.map((r) => {
    const tag = `v${r.version}`;
    const at = existingTags.get(tag);
    const action = at === undefined ? 'create' : at === r.commit ? 'skip' : 'conflict';
    return { tag, commit: r.commit, date: r.date, action };
  });
}
