#!/usr/bin/env node
/**
 * Creates one annotated git tag (v0.0.1 ... v2.38.0) for each version in scripts/retro-versions.json:
 * the versions recorded after the fact for the history before versioning existed (docs/VERSIONING.md).
 * Run it once. Later tags are made by .github/workflows/release.yml after each merge.
 *
 *   node scripts/tag-retro-versions.mjs            dry run (the default): lists what it would do
 *   node scripts/tag-retro-versions.mjs --live     creates the missing tags locally
 *   node scripts/tag-retro-versions.mjs --live --sign   the same, signed (git tag -s)
 *
 * Each tag's date is its commit's date, so `git tag --sort=creatordate` reads in order. A tag that
 * already points at the right commit is skipped; one that points elsewhere stops the run (pushed
 * tags are never moved). Nothing is pushed: check `git tag -n -l "v*"`, then run
 * `git push origin --tags` yourself, before the first merge that runs the release workflow.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRetroTags } from './versionLogic.mjs';

const APP_DIR = fileURLToPath(new URL('../', import.meta.url));
const REPO_DIR = resolve(APP_DIR, '..');
const live = process.argv.includes('--live');
const sign = process.argv.includes('--sign');

const git = (args, env) =>
  execFileSync('git', args, { cwd: REPO_DIR, encoding: 'utf8', env: { ...process.env, ...env } }).trim();

const retro = JSON.parse(readFileSync(resolve(APP_DIR, 'scripts/retro-versions.json'), 'utf8'));
const existing = new Map(
  git(['for-each-ref', '--format=%(refname:short) %(*objectname)%(objectname)', 'refs/tags/v*'])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      // an annotated tag prints the commit (*objectname) then the tag object; keep the first 40 hex
      const [name, ids] = line.split(' ');
      return [name, ids.slice(0, 40)];
    }),
);
const plan = planRetroTags(retro, existing);

const conflicts = plan.filter((r) => r.action === 'conflict');
for (const r of conflicts) console.error(`CONFLICT ${r.tag} already points at ${existing.get(r.tag)}, not ${r.commit}`);
if (conflicts.length > 0) process.exit(1);

for (const r of plan) {
  console.log(`${r.action.padEnd(6)} ${r.tag.padEnd(9)} ${r.commit.slice(0, 7)} ${r.date}`);
  if (!live || r.action !== 'create') continue;
  const when = git(['log', '-1', '--format=%cI', r.commit]);
  git(['tag', sign ? '-s' : '-a', r.tag, '-m', `${r.tag} (recorded retroactively, see CHANGELOG.md)`, r.commit], {
    GIT_COMMITTER_DATE: when,
  });
}
const toCreate = plan.filter((r) => r.action === 'create').length;
console.log(
  live
    ? `\nCreated ${toCreate} tag(s). Check them with git tag -n -l "v*", then run: git push origin --tags`
    : `\nDry run: ${toCreate} tag(s) to create, ${plan.length - toCreate} already there. Run again with --live to create them.`,
);
