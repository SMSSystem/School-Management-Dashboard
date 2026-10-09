#!/usr/bin/env node
/**
 * READ-ONLY census of the legacy flat (top-level) collections.
 *
 * Before the nested data model (institutions/{id}/...), every institution's
 * data lived in top-level collections such as /results and /reportCards.
 * firestore.rules still carries those flat rule blocks (CUTOVER_RUNBOOK.md C2
 * is the optional cleanup). This script counts the documents in each flat
 * collection, so you can tell whether any legacy data is still live before
 * deciding whether a rules change (for example the spectator role,
 * docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md OQ4) needs to touch them.
 *
 * It also lists every top-level collection that exists, so an unexpected one
 * shows up. Live flat collections that are expected to have data (users,
 * student_parents, registration_directory, institutions) are shown separately
 * and are not a cutover signal.
 *
 * Uses Firestore count() aggregations (about 1 read per 1,000 index entries,
 * minimum 1 per collection): roughly 30-60 reads in total.
 *
 * This script NEVER writes: no set/update/delete, no Auth changes. It prints
 * counts only, never document contents, ids, names or emails. It refuses to
 * run unless --project equals the project_id inside the --key file.
 *
 * Usage:
 *   node scripts/count-legacy-flat-collections.mjs --key=<path> --project=<id>
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Flat collections that have a nested twin under institutions/{id}/..., taken
// from the "legacy flat" blocks in firestore.rules.
const LEGACY_FLAT = [
  'subjects',
  'classes',
  'terms',
  'academicYears',
  'nonSchoolDays',
  'houses',
  'departments',
  'teachers',
  'students',
  'lessons',
  'exams',
  'assignments',
  'results',
  'feedback_comments',
  'studentActivities',
  'studentResponsibilities',
  'reportCardComments',
  'reportCards',
  'disciplinaryActions',
  'generalAttendance',
  'subjectEnrollments',
  'subjectAttendance',
  'attendanceSummaries',
  'events',
  'announcements',
  'timetable_slots',
  'gradebooks',
];

// Top-level collections the app still uses on purpose.
const LIVE_FLAT = ['users', 'student_parents', 'institutions', 'registration_directory'];

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/count-legacy-flat-collections.mjs --key=<path> --project=<id>

  --key=<path>     Service-account JSON key. Required (no Application Default
                   Credentials fallback).
  --project=<id>   The Firebase project id you expect to read. Must equal the
                   project_id inside the key file, or the script refuses.
  --help           Show this text.

This script only reads. It never writes to Firestore or Auth.
`);
  process.exit(code);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { keyPath: null, project: null };
  for (const arg of argv) {
    if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--project=')) opts.project = arg.slice('--project='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.keyPath) fail('--key=<path> is required (there is no Application Default Credentials fallback).');
  if (!opts.project) fail('--project=<id> is required, so the script can prove it reads the project you meant.');
  return opts;
}

function readKey(keyPath) {
  if (!existsSync(keyPath)) fail(`Key file not found: ${keyPath}`);
  let key;
  try {
    key = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch {
    fail(`Key file is not valid JSON: ${keyPath}`);
  }
  if (!key || typeof key.project_id !== 'string') fail('Key file has no project_id.');
  return key;
}

async function countOf(db, name) {
  const snap = await db.collection(name).count().get();
  return snap.data().count;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const key = readKey(opts.keyPath);
  console.log(`Key file project_id: ${key.project_id}`);
  if (opts.project !== key.project_id) {
    fail(`--project=${opts.project} does not match the key's project_id (${key.project_id}). Nothing was read.`);
  }

  initializeApp({ credential: cert(key), projectId: key.project_id });
  const db = getFirestore();

  const present = new Set((await db.listCollections()).map((c) => c.id));
  const problems = [];

  console.log('\nLegacy flat collections (should be empty after the cutover):');
  let legacyTotal = 0;
  const legacyCounts = {};
  for (const name of LEGACY_FLAT) {
    if (!present.has(name)) {
      legacyCounts[name] = 0;
      console.log(`  ${name.padEnd(26)} absent`);
      continue;
    }
    try {
      const n = await countOf(db, name);
      legacyCounts[name] = n;
      legacyTotal += n;
      console.log(`  ${name.padEnd(26)} ${String(n).padStart(8)}`);
    } catch (err) {
      problems.push(`${name}: ${err.message}`);
      console.log(`  ${name.padEnd(26)} ERROR`);
    }
  }

  console.log('\nLive top-level collections (expected to hold data):');
  for (const name of LIVE_FLAT) {
    if (!present.has(name)) {
      console.log(`  ${name.padEnd(26)} absent`);
      continue;
    }
    try {
      console.log(`  ${name.padEnd(26)} ${String(await countOf(db, name)).padStart(8)}`);
    } catch (err) {
      problems.push(`${name}: ${err.message}`);
      console.log(`  ${name.padEnd(26)} ERROR`);
    }
  }

  const known = new Set([...LEGACY_FLAT, ...LIVE_FLAT]);
  const unknown = [...present].filter((id) => !known.has(id)).sort();
  if (unknown.length) {
    console.log('\nOther top-level collections present (not in either list above):');
    for (const name of unknown) console.log(`  ${name}`);
  }

  console.log(`\nLegacy flat documents in total: ${legacyTotal}`);
  if (problems.length) {
    console.log('\nProblems:');
    for (const p of problems) console.log(`  ${p}`);
  }
  if (legacyTotal === 0 && problems.length === 0) {
    console.log('RESULT: no legacy flat data. The flat rule blocks can be left unchanged.');
  } else if (problems.length === 0) {
    console.log('RESULT: legacy flat data still exists in the collections above with a non-zero count.');
  } else {
    console.log('RESULT: inconclusive (see problems).');
  }
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
