#!/usr/bin/env node
/**
 * Deletes the 30 leftover documents in the legacy flat collections.
 *
 * scripts/count-legacy-flat-collections.mjs and
 * scripts/list-legacy-flat-documents.mjs showed that the old top-level
 * collections (results, reportCards, teachers, students and so on) hold only:
 *   - 22 "_placeholder" documents, one field "_placeholder" (a trick used in
 *     June to make an empty collection visible in the Firebase Console), and
 *   - 8 teacher/student mirror documents that the app stopped writing in the
 *     nested-data cutover. Nothing in src/ reads any of them.
 * See docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md (OQ4, DF7).
 *
 * Safety:
 *   - Deletes ONLY the 30 exact paths hard-coded below. It runs no queries
 *     over collections, so it cannot find or delete anything else.
 *   - Before deleting, every document must still look as it did in the
 *     listing (field names, no subcollections, a mirror's uid equals its id).
 *     One document that does not matches: the run stops, nothing is deleted.
 *   - Dry run is the default. --live asks you to type a confirmation phrase.
 *   - Never writes to users, never touches Auth, never prints or logs a field
 *     value (only field names and ids).
 *   - Refuses to run unless --project equals the project_id inside the --key
 *     file.
 *
 * Usage:
 *   node scripts/delete-legacy-flat-documents.mjs --key=<path> --project=<id> [--live]
 *
 * Writes a result log to scripts/logs/delete-legacy-flat-documents-<time>.json
 * (gitignored; ids and counts only). Never commit the key (see .gitignore).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, 'logs');

const PLACEHOLDER_ID = '_placeholder';
const PLACEHOLDER_COLLECTIONS = [
  'subjects',
  'classes',
  'terms',
  'academicYears',
  'nonSchoolDays',
  'houses',
  'departments',
  'teachers',
  'students',
  'results',
  'feedback_comments',
  'studentActivities',
  'studentResponsibilities',
  'reportCardComments',
  'reportCards',
  'generalAttendance',
  'subjectEnrollments',
  'subjectAttendance',
  'attendanceSummaries',
  'timetable_slots',
  'gradebooks',
  'reports',
];

const MIRRORS = {
  teachers: [
    'BqJb1LrjzdZ69EAG2Vz3XL0rRhH3',
    'Np1F6FUMmwVoUWCI8Hqc9q2rBok1',
    'vC57gjWVWPaLjP80NnZYMinLIYn2',
    'zih4YrtB8aNLyQWbSlA8XMGT7FS2',
  ],
  students: [
    'EhgkJEvaTMTkphgHK6OWAWoqJqA3',
    'WKa5Zb5boZXayJjOoHDO7jrec5R2',
    'YZCfLnouWjMEG6Vd0lDsn0538Qv1',
    'mpvmIqYzOZMsHEh585WzwaANJlC3',
  ],
};
const MIRROR_FIELDS = new Set(['createdAt', 'createdBy', 'departmentId', 'institutionId', 'teacherType', 'uid']);

// The exact paths, in a fixed order.
const TARGETS = [
  ...PLACEHOLDER_COLLECTIONS.map((c) => ({ collection: c, id: PLACEHOLDER_ID, kind: 'placeholder' })),
  ...Object.entries(MIRRORS).flatMap(([c, ids]) => ids.map((id) => ({ collection: c, id, kind: 'mirror' }))),
];

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/delete-legacy-flat-documents.mjs --key=<path> --project=<id> [--live]

  --key=<path>     Service-account JSON key. Required (no Application Default
                   Credentials fallback).
  --project=<id>   The Firebase project id you expect to change. Must equal the
                   project_id inside the key file, or the script refuses.
  --live           Actually delete. Without it, this is a dry run that only
                   reads and reports. --live asks you to type a confirmation.
  --help           Show this text.

Deletes only the ${TARGETS.length} exact leftover documents listed in the script.
`);
  process.exit(code);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { keyPath: null, project: null, live: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--project=')) opts.project = arg.slice('--project='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.keyPath) fail('--key=<path> is required (there is no Application Default Credentials fallback).');
  if (!opts.project) fail('--project=<id> is required, so the script can prove it changes the project you meant.');
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

const label = (t) => `${t.collection}/${t.id}`;

// Returns { state: 'gone' | 'ok' | 'mismatch', reason?, userDocExists? }.
// Only field NAMES are inspected for the shape check; the one value compared
// is a mirror's uid against its own id, and it is never printed.
async function classify(db, target) {
  const ref = db.collection(target.collection).doc(target.id);
  const snap = await ref.get();
  if (!snap.exists) return { state: 'gone' };

  const data = snap.data() ?? {};
  const names = Object.keys(data);

  if (target.kind === 'placeholder') {
    if (names.length !== 1 || names[0] !== PLACEHOLDER_ID) {
      return { state: 'mismatch', reason: `fields are [${names.sort().join(', ')}], expected only [_placeholder]` };
    }
  } else {
    const unexpected = names.filter((n) => !MIRROR_FIELDS.has(n));
    if (unexpected.length) {
      return { state: 'mismatch', reason: `unexpected fields [${unexpected.sort().join(', ')}]` };
    }
    if (data.uid !== target.id) {
      return { state: 'mismatch', reason: 'its uid field does not equal its document id' };
    }
  }

  const subs = await ref.listCollections();
  if (subs.length) {
    return { state: 'mismatch', reason: `has subcollections [${subs.map((s) => s.id).join(', ')}]` };
  }

  const result = { state: 'ok' };
  if (target.kind === 'mirror') {
    result.userDocExists = (await db.collection('users').doc(target.id).get()).exists;
  }
  return result;
}

async function confirm(phrase) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Type ${phrase} to continue: `);
    return answer.trim() === phrase;
  } finally {
    rl.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const key = readKey(opts.keyPath);
  console.log(`Key file project_id: ${key.project_id}`);
  if (opts.project !== key.project_id) {
    fail(`--project=${opts.project} does not match the key's project_id (${key.project_id}). Nothing was read or changed.`);
  }
  console.log(opts.live ? 'Mode: LIVE (will delete after confirmation)' : 'Mode: dry run (nothing is deleted)');

  initializeApp({ credential: cert(key), projectId: key.project_id });
  const db = getFirestore();

  // 1. Classify every target.
  const classified = [];
  for (const target of TARGETS) {
    classified.push({ target, ...(await classify(db, target)) });
  }
  const ok = classified.filter((c) => c.state === 'ok');
  const gone = classified.filter((c) => c.state === 'gone');
  const mismatch = classified.filter((c) => c.state === 'mismatch');

  console.log(`\nChecked ${TARGETS.length} documents: ${ok.length} ready to delete, ${gone.length} already gone, ${mismatch.length} not as expected.`);
  for (const c of ok) {
    const extra =
      c.userDocExists === undefined ? '' : `   (users document with this id exists: ${c.userDocExists ? 'yes' : 'no'})`;
    console.log(`  delete  ${label(c.target)}${extra}`);
  }
  for (const c of gone) console.log(`  gone    ${label(c.target)}`);
  for (const c of mismatch) console.log(`  MISMATCH ${label(c.target)}: ${c.reason}`);

  // 2. Read-only note about users/_placeholder. Never deleted here.
  const up = await db.collection('users').doc(PLACEHOLDER_ID).get();
  if (up.exists) {
    const names = Object.keys(up.data() ?? {}).sort();
    console.log(
      `\nNote: users/_placeholder exists (fields: ${names.join(', ') || 'none'}). ` +
        `It has ${names.includes('role') ? 'a' : 'no'} role field and ${names.includes('institutionId') ? 'an' : 'no'} institutionId field. ` +
        'This script does not touch it.',
    );
  } else {
    console.log('\nNote: users/_placeholder does not exist.');
  }

  if (mismatch.length) {
    fail('\nOne or more documents are not as expected. Nothing was deleted. Check the lines marked MISMATCH.');
  }
  if (ok.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  if (!opts.live) {
    console.log('\nDry run complete. To delete, run the same command with --live;');
    console.log(`you will be asked to type: DELETE ${ok.length} LEGACY DOCUMENTS`);
    return;
  }

  // 3. Live: confirm, delete, verify.
  const phrase = `DELETE ${ok.length} LEGACY DOCUMENTS`;
  if (!(await confirm(phrase))) fail('Confirmation did not match. Nothing was deleted.');

  const failures = [];
  try {
    const batch = db.batch();
    for (const c of ok) batch.delete(db.collection(c.target.collection).doc(c.target.id));
    await batch.commit();
  } catch (err) {
    failures.push(err.message);
  }

  let remaining = 0;
  for (const target of TARGETS) {
    if ((await db.collection(target.collection).doc(target.id).get()).exists) remaining += 1;
  }

  mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = path.join(LOGS_DIR, `delete-legacy-flat-documents-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        projectId: key.project_id,
        requested: ok.length,
        alreadyGone: gone.length,
        remainingAfter: remaining,
        deleted: ok.map((c) => label(c.target)),
        failures,
      },
      null,
      2,
    ),
  );

  console.log(`\nDeleted batch of ${ok.length}. Documents still present afterwards: ${remaining}.`);
  console.log(`Log written: ${logPath}`);
  if (failures.length || remaining > 0) process.exit(1);
  console.log('Done. Re-run scripts/count-legacy-flat-collections.mjs to confirm there is no legacy flat data.');
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
