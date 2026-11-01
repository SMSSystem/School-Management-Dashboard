#!/usr/bin/env node
/**
 * Reads and changes the project version. The rules for choosing a bump are in docs/VERSIONING.md;
 * the decisions live in versionLogic.mjs.
 *
 *   node scripts/version.mjs bump <major|minor|patch> --title "Plain title" [--pr 90] [--date YYYY-MM-DD]
 *       (npm run version:bump -- minor --title "...")
 *       Sets the new version in package.json and both places in package-lock.json, and turns the
 *       CHANGELOG's Unreleased bullets into the new version's entry. Write those bullets first.
 *       It commits nothing and creates no tag: the tag is made by .github/workflows/release.yml
 *       after the pull request is merged.
 *
 *   node scripts/version.mjs check [--base <git ref>]          (npm run version:check)
 *       Fails when package.json, package-lock.json and CHANGELOG.md disagree. With --base (the
 *       pull-request check passes origin/main) it also fails when the branch changes code that
 *       ships without raising the version, or when the new version's tag already exists.
 *
 *   node scripts/version.mjs extract <version>                 (npm run version:extract -- 2.39.0)
 *       Prints one version's CHANGELOG entry (the GitHub Release body).
 *
 *   node scripts/version.mjs current
 *       Prints the version in package.json.
 *
 * Plain Node with no dependencies, so the GitHub workflows run it without `npm ci`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyRelease,
  bumpVersion,
  BUMP_KINDS,
  checkAgainstBase,
  checkConsistency,
  extractEntry,
} from './versionLogic.mjs';

const APP_DIR = fileURLToPath(new URL('../', import.meta.url));
const REPO_DIR = resolve(APP_DIR, '..');
const PATHS = {
  packageJson: resolve(APP_DIR, 'package.json'),
  packageLock: resolve(APP_DIR, 'package-lock.json'),
  changelog: resolve(REPO_DIR, 'CHANGELOG.md'),
  retro: resolve(APP_DIR, 'scripts/retro-versions.json'),
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
// npm writes both files with two-space indents and a final newline; keep them that way
const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
const git = (...args) => execFileSync('git', args, { cwd: REPO_DIR, encoding: 'utf8' }).trim();
// the local calendar date, so a release made in the evening is not dated tomorrow
const today = () => new Date().toLocaleDateString('en-CA');

function option(args, name) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value`);
  return value;
}

function fail(message) {
  console.error(`version: ${message}`);
  process.exit(1);
}

function readAll() {
  return {
    packageJson: readJson(PATHS.packageJson),
    packageLock: readJson(PATHS.packageLock),
    changelog: readFileSync(PATHS.changelog, 'utf8'),
    retroVersions: readJson(PATHS.retro),
  };
}

function bump(args) {
  const kind = args[0];
  if (!BUMP_KINDS.includes(kind)) fail(`usage: bump <${BUMP_KINDS.join('|')}> --title "..." [--pr <n>] [--date YYYY-MM-DD]`);
  const title = option(args, 'title');
  if (!title) fail('--title is required (a few plain words, shown in the CHANGELOG entry)');
  const prArg = option(args, 'pr');
  const prs = prArg ? prArg.split(',').map((n) => Number(n.replace(/^#/, ''))) : [];
  if (prs.some((n) => !Number.isInteger(n) || n <= 0)) fail(`--pr "${prArg}" is not a pull-request number`);
  const date = option(args, 'date') ?? today();

  const files = readAll();
  const before = checkConsistency({ ...files, today: date });
  if (before.length > 0) fail(`fix these first:\n  - ${before.join('\n  - ')}`);

  const version = bumpVersion(files.packageJson.version, kind);
  let changelog;
  try {
    changelog = applyRelease(files.changelog, { version, date, title, prs });
  } catch (err) {
    fail(err.message);
  }
  files.packageJson.version = version;
  files.packageLock.version = version;
  files.packageLock.packages[''].version = version;
  writeJson(PATHS.packageJson, files.packageJson);
  writeJson(PATHS.packageLock, files.packageLock);
  writeFileSync(PATHS.changelog, changelog);
  console.log(`version: ${files.packageJson.version} (${kind}). Review CHANGELOG.md, then run npm test.`);
}

function check(args) {
  const files = readAll();
  const problems = checkConsistency({ ...files, today: today() });
  const base = option(args, 'base');
  if (base) {
    const version = files.packageJson.version;
    const baseVersion = JSON.parse(git('show', `${base}:sms-system/package.json`)).version;
    const changedPaths = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
    let tagExists = true;
    try {
      git('rev-parse', '--quiet', '--verify', `refs/tags/v${version}`);
    } catch {
      tagExists = false;
    }
    problems.push(...checkAgainstBase({ version, baseVersion, changedPaths, tagExists }));
  }
  if (problems.length > 0) fail(`${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  console.log(`version: ${files.packageJson.version}, package files and CHANGELOG.md agree${base ? ` (checked against ${base})` : ''}`);
}

function extract(args) {
  const version = args[0];
  if (!version) fail('usage: extract <version>');
  const body = extractEntry(readFileSync(PATHS.changelog, 'utf8'), version);
  if (body === null) fail(`CHANGELOG.md has no entry for ${version}`);
  console.log(body);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'bump') bump(rest);
else if (command === 'check') check(rest);
else if (command === 'extract') extract(rest);
else if (command === 'current') console.log(readJson(PATHS.packageJson).version);
else fail('usage: version.mjs <bump|check|extract|current> (see the header of scripts/version.mjs)');
