#!/usr/bin/env node
/**
 * Deletes the 5 leftover "columns" documents under the legacy top-level
 * "gradebooks" collection.
 *
 * After scripts/delete-legacy-flat-documents.mjs removed the other leftovers,
 * scripts/count-legacy-flat-collections.mjs still listed "gradebooks"
 * (count 0), and scripts/list-legacy-gradebook-columns.mjs showed why: two
 * gradebooks/{id} parent documents do not exist, but they still hold 4 and 1
 * "columns" documents (created 25-26 June, from deleted test gradebooks).
 * Firestore does not delete subcollections with their parent. Nothing in src/
 * reads the flat gradebooks path. See
 * docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md (DF7).
 *
 * Safety:
 *   - Deletes ONLY the 5 exact paths hard-coded below.
 *   - Before deleting, each parent must still be missing, each column must
 *     still have exactly the expected field names, and each parent must hold
 *     no other column document or subcollection than the ones listed. Any
 *     difference stops the run with nothing deleted.
 *   - Dry run is the default. --live asks you to type a confirmation phrase.
 *   - Never touches Auth or users, never prints or logs a field value.
 *   - Refuses to run unless --project equals the project_id inside the --key
 *     file.
 *
 * Usage:
 *   node scripts/delete-legacy-gradebook-columns.mjs --key=<path> --project=<id> [--live]
 *
 * Writes scripts/logs/delete-legacy-gradebook-columns-<time>.json (gitignored;
 * ids and counts only). Never commit the key (see .gitignore).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline/promises';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, 'logs');

const COLLECTION = 'gradebooks';
const SUBCOLLECTION = 'columns';

// The parent ids contain an en dash (U+2013), exactly as in the listing.
const PARENTS = {
  '8EynfAbhPZ3EtDBlTH7U_F2f2Kp6v908NhEhHMQeZ_L3jsZ026AGgV3xFvQyfm_2025–2026_3': [
    'P5I6KJ5scAOOhLtE1q40',
    'PINnLji9OMpcdpP6DOJ7',
    'VpcpkHePY5Od6Ydri9G2',
    'iCaS5qmLThUuze8j6J3Q',
  ],
  'qGAenROTYJvjoQ4Z4WIe_OieR0gNZDkYyPzM4mT0z_HJ6F2HvzLgJjBWwAK2hF_2025–2026_3': ['dRzFCVcO1hDMateWsrua'],
};

const EXPECTED_FIELDS = [
  'assessmentType',
  'columnWeight',
  'createdAt',
  'createdBy',
  'date',
  'institutionId',
  'label',
  'maxScore',
  'order',
  'subjectId',
];

const TARGETS = Object.entries(PARENTS).flatMap(([parentId, ids]) => ids.map((id) => ({ parentId, id })));

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/delete-legacy-gradebook-columns.mjs --key=<path> --project=<id> [--live]

  --key=<path>     Service-account JSON key. Required (no Application Default
                   Credentials fallback).
  --project=<id>   The Firebase project id you expect to change. Must equal the
                   project_id inside the key file, or the script refuses.
  --live           Actually delete. Without it, this is a dry run that only
                   reads and reports. --live asks you to type a confirmation.
  --help           Show this text.

Deletes only the ${TARGETS.length} exact leftover column documents listed in the script.
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

async function confirm(phrase) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Type ${phrase} to continue: `);
    return answer.trim() === phrase;
  } finally {
    rl.close();
  }
}

const colRef = (db, t) => db.collection(COLLECTION).doc(t.parentId).collection(SUBCOLLECTION).doc(t.id);
const shortParent = (id) => `${id.slice(0, 8)}…${id.slice(-12)}`;

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

  const problems = [];
  const ok = [];
  const gone = [];

  // 1. Each parent must still be missing, hold only the "columns"
  //    subcollection, and hold no more column documents than we expect.
  for (const [parentId, ids] of Object.entries(PARENTS)) {
    const parentRef = db.collection(COLLECTION).doc(parentId);
    if ((await parentRef.get()).exists) {
      problems.push(`${shortParent(parentId)}: the parent document now exists (it was missing in the listing)`);
      continue;
    }
    const subs = (await parentRef.listCollections()).map((s) => s.id);
    const other = subs.filter((s) => s !== SUBCOLLECTION);
    if (other.length) problems.push(`${shortParent(parentId)}: has other subcollections [${other.join(', ')}]`);
    const total = (await parentRef.collection(SUBCOLLECTION).count().get()).data().count;
    const present = [];
    for (const id of ids) if ((await parentRef.collection(SUBCOLLECTION).doc(id).get()).exists) present.push(id);
    if (total !== present.length) {
      problems.push(`${shortParent(parentId)}: holds ${total} column document(s), ${present.length} of them on the list`);
    }
  }

  // 2. Each column document must look as listed.
  for (const t of TARGETS) {
    const snap = await colRef(db, t).get();
    if (!snap.exists) {
      gone.push(t);
      continue;
    }
    const names = Object.keys(snap.data() ?? {}).sort();
    const same = names.length === EXPECTED_FIELDS.length && names.every((n, i) => n === EXPECTED_FIELDS[i]);
    if (!same) {
      problems.push(`${shortParent(t.parentId)}/${SUBCOLLECTION}/${t.id}: fields are [${names.join(', ')}]`);
      continue;
    }
    if ((await snap.ref.listCollections()).length) {
      problems.push(`${shortParent(t.parentId)}/${SUBCOLLECTION}/${t.id}: has subcollections`);
      continue;
    }
    ok.push(t);
  }

  console.log(`\nChecked ${TARGETS.length} column documents: ${ok.length} ready to delete, ${gone.length} already gone, ${problems.length} problem(s).`);
  for (const t of ok) console.log(`  delete  ${COLLECTION}/${shortParent(t.parentId)}/${SUBCOLLECTION}/${t.id}`);
  for (const t of gone) console.log(`  gone    ${COLLECTION}/${shortParent(t.parentId)}/${SUBCOLLECTION}/${t.id}`);
  for (const p of problems) console.log(`  PROBLEM ${p}`);

  if (problems.length) fail('\nSomething is not as expected. Nothing was deleted. Check the lines marked PROBLEM.');
  if (ok.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  if (!opts.live) {
    console.log('\nDry run complete. To delete, run the same command with --live;');
    console.log(`you will be asked to type: DELETE ${ok.length} LEGACY GRADEBOOK COLUMNS`);
    return;
  }

  // 3. Live: confirm, delete, verify.
  const phrase = `DELETE ${ok.length} LEGACY GRADEBOOK COLUMNS`;
  if (!(await confirm(phrase))) fail('Confirmation did not match. Nothing was deleted.');

  const failures = [];
  try {
    const batch = db.batch();
    for (const t of ok) batch.delete(colRef(db, t));
    await batch.commit();
  } catch (err) {
    failures.push(err.message);
  }

  let remaining = 0;
  for (const t of TARGETS) if ((await colRef(db, t).get()).exists) remaining += 1;
  const stillListed = (await db.listCollections()).some((c) => c.id === COLLECTION);

  mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = path.join(LOGS_DIR, `delete-legacy-gradebook-columns-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        projectId: key.project_id,
        requested: ok.length,
        alreadyGone: gone.length,
        remainingAfter: remaining,
        gradebooksStillListed: stillListed,
        deleted: ok.map((t) => `${COLLECTION}/${t.parentId}/${SUBCOLLECTION}/${t.id}`),
        failures,
      },
      null,
      2,
    ),
  );

  console.log(`\nDeleted batch of ${ok.length}. Documents still present afterwards: ${remaining}.`);
  console.log(`"${COLLECTION}" still listed as a collection: ${stillListed ? 'yes (it can take a moment to drop; re-run the census)' : 'no'}`);
  console.log(`Log written: ${logPath}`);
  if (failures.length || remaining > 0) process.exit(1);
  console.log('Done. Re-run scripts/count-legacy-flat-collections.mjs to confirm there is no legacy flat data.');
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});
