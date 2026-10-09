#!/usr/bin/env node
/**
 * READ-ONLY counts and verification for the bulk-seed institution
 * (Day-0 preflight, §A.4 step 3 and §A.6 of
 * internal/retcon/CLIENT_SIDE_SECURITY_TIGHTENING_PLAN.md).
 *
 * Default mode ("counts"): before scripts/teardown-bulk-institution.mjs runs,
 * counts the documents it will delete, so you know how many budgeted daily
 * runs to expect. Uses Firestore count() aggregations (about 1 read per 1,000
 * index entries per query, minimum 1), so the whole run costs on the order of
 * 100-200 reads. Also looks for subcollections under the institution that
 * the teardown script does not drain.
 *
 * --verify: after teardown, checks that everything is gone (Auth accounts on
 * the seed email domain, the institution and directory documents, the
 * roster's users documents, student_parents links, every subcollection) and
 * prints PASS or FAIL for each.
 *
 * This script NEVER writes: no set/update/delete, no Auth changes. It takes
 * the institution id only from the seed checkpoint
 * (scripts/.seed-checkpoint.json) and refuses to run unless:
 *   - --project equals the project_id inside the --key file (printed);
 *   - the institution's name, if it exists, ends with
 *     "(Seed Test Institution)".
 * No emails, names, uids or passwords are printed or logged; the counts log
 * (scripts/logs/count-seed-institution-<time>.json) holds counts only.
 *
 * Usage:
 *   node scripts/count-seed-institution.mjs --key=<path> --project=<id> [--verify]
 *
 * Never commit the key or the checkpoint (see .gitignore).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_CHECKPOINT_PATH = path.join(__dirname, '.seed-checkpoint.json');
const FIREBASERC_PATH = path.join(__dirname, '..', '.firebaserc');
const LOGS_DIR = path.join(__dirname, 'logs');

// Must match seed-bulk-institution.mjs / teardown-bulk-institution.mjs.
const SEED_INSTITUTION_SUFFIX = '(Seed Test Institution)';
const EXPECTED_EMAIL_DOMAIN = 'jones-and-sons.seed.test';
const DEFAULT_DELETE_BUDGET = 15_000; // the budget the plan recommends per daily run

// The collections scripts/teardown-bulk-institution.mjs drains under
// institutions/{id} (keep in step with its NESTED_COLLECTIONS), plus
// gradebooks (which has a nested "columns" subcollection of its own).
const TEARDOWN_NESTED_COLLECTIONS = [
  'enrollmentRegistrations',
  'progressReports',
  'reportCards',
  'reportCardComments',
  'disciplinaryActions',
  'studentResponsibilities',
  'studentActivities',
  'attendanceSummaries',
  'subjectAttendance',
  'generalAttendance',
  'feedback_comments',
  'results',
  'assignments',
  'exams',
  'timetable_slots',
  'subjectEnrollments',
  'subjects',
  'classes',
  'departments',
  'houses',
  'terms',
  'academicYears',
];
const GRADEBOOKS = 'gradebooks';

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/count-seed-institution.mjs --key=<path> --project=<id> [--verify]

  --key=<path>     Service-account JSON key for the project that holds the seed
                   institution. Required (no Application Default Credentials
                   fallback).
  --project=<id>   The Firebase project id you expect to read. Must equal the
                   project_id inside the key file, or the script refuses.
  --verify         Post-teardown check: prints PASS or FAIL for each item
                   instead of the planning counts.
  --help           Show this text.

This script only reads. It never writes to Firestore or Auth.
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { keyPath: null, project: null, verify: false };
  for (const arg of argv) {
    if (arg === '--verify') opts.verify = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--project=')) opts.project = arg.slice('--project='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (!opts.keyPath) {
    console.error('--key=<path> is required (there is no Application Default Credentials fallback).');
    printUsageAndExit(1);
  }
  if (!opts.project) {
    console.error('--project=<id> is required, so the script can prove it reads the project you meant.');
    printUsageAndExit(1);
  }
  return opts;
}

function fail(message) {
  console.error(message);
  process.exit(1);
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

function readFirebasercDefault() {
  try {
    if (!existsSync(FIREBASERC_PATH)) return null;
    return JSON.parse(readFileSync(FIREBASERC_PATH, 'utf8'))?.projects?.default ?? null;
  } catch {
    return null;
  }
}

function loadSeedCheckpoint() {
  if (!existsSync(SEED_CHECKPOINT_PATH)) {
    fail(
      `No seed checkpoint found at ${SEED_CHECKPOINT_PATH}. This script takes the institution id from it ` +
        '(never from a broad query), so there is nothing it can safely read without it.',
    );
  }
  let cp;
  try {
    cp = JSON.parse(readFileSync(SEED_CHECKPOINT_PATH, 'utf8'));
  } catch {
    fail('The seed checkpoint is not valid JSON.');
  }
  if (!cp || typeof cp.institutionId !== 'string' || !cp.institutionId) {
    fail('The seed checkpoint has no institutionId.');
  }
  if (typeof cp.emailDomain !== 'string' || cp.emailDomain.toLowerCase() !== EXPECTED_EMAIL_DOMAIN) {
    fail(`The seed checkpoint's emailDomain is not "${EXPECTED_EMAIL_DOMAIN}". Refusing to continue.`);
  }
  return cp;
}

// One count() aggregation; returns a number, or null if the query failed.
async function countQuery(query, label, problems) {
  try {
    const snap = await query.count().get();
    return snap.data().count;
  } catch (err) {
    problems.push(`${label}: ${err && err.code ? err.code : 'error'}`);
    return null;
  }
}

async function verifySeedName(db, collectionName, institutionId) {
  const snap = await db.collection(collectionName).doc(institutionId).get();
  if (!snap.exists) return { exists: false };
  const name = snap.data()?.name ?? '';
  if (typeof name !== 'string' || !name.endsWith(SEED_INSTITUTION_SUFFIX)) {
    fail(
      `Safety check failed: ${collectionName}/${institutionId} has a name that does not end with ` +
        `"${SEED_INSTITUTION_SUFFIX}". Refusing to read further.`,
    );
  }
  return { exists: true };
}

// Counts the "columns" subcollections of this institution's gradebooks.
// 1) One collection-group count over a document-path range. Firestore needs
//    both bounds to be complete document paths (an even number of segments),
//    so the bounds use the lowest and highest printable segment characters.
//    May also need a collection-group index; if either step fails, fall back.
// 2) Per-gradebook counts (one aggregation per gradebook, so at most one read
//    each); skipped above MAX_PER_GRADEBOOK_COUNTS gradebooks.
const MAX_PER_GRADEBOOK_COUNTS = 1000;
async function countColumns(db, instRef, gradebookCount, problems) {
  const base = `institutions/${instRef.id}/gradebooks`;
  try {
    const snap = await db
      .collectionGroup('columns')
      .where(FieldPath.documentId(), '>=', `${base}/!/columns/!`)
      .where(FieldPath.documentId(), '<=', `${base}/~/columns/~`)
      .count()
      .get();
    return snap.data().count;
  } catch (err) {
    problems.push(`gradebooks/columns (range count): ${err && err.code ? err.code : 'unsupported'}; trying per-gradebook counts`);
  }
  if (gradebookCount === null || gradebookCount > MAX_PER_GRADEBOOK_COUNTS) {
    problems.push(`gradebooks/columns: skipped (gradebook count ${gradebookCount === null ? 'unknown' : gradebookCount} is above ${MAX_PER_GRADEBOOK_COUNTS}); teardown still deletes them`);
    return null;
  }
  try {
    const refs = await instRef.collection(GRADEBOOKS).listDocuments();
    let total = 0;
    for (const ref of refs) {
      const snap = await ref.collection('columns').count().get();
      total += snap.data().count;
    }
    return total;
  } catch (err) {
    problems.push(`gradebooks/columns (per-gradebook): ${err && err.code ? err.code : 'error'}`);
    return null;
  }
}

// Counts every subcollection under institutions/{id} that teardown drains,
// plus any extra ones found by listCollections() that teardown does not
// drain, plus the gradebooks' nested "columns".
async function countInstitutionTree(db, institutionId, problems) {
  const instRef = db.collection('institutions').doc(institutionId);
  const rows = []; // { name, count, drained }

  for (const name of [...TEARDOWN_NESTED_COLLECTIONS, GRADEBOOKS]) {
    const count = await countQuery(instRef.collection(name), name, problems);
    rows.push({ name, count, drained: true });
  }

  // gradebooks/{id}/columns. Two ways, cheapest first; either failing is
  // reported as a problem (never a crash), because teardown deletes the
  // columns regardless: this number is only for planning.
  const gradebookCount = rows.find((r) => r.name === GRADEBOOKS)?.count ?? null;
  const columns = await countColumns(db, instRef, gradebookCount, problems);
  rows.push({ name: 'gradebooks/*/columns', count: columns, drained: true });

  // Subcollections teardown does not drain (the plan says several exist).
  let extraNames = [];
  try {
    const known = new Set([...TEARDOWN_NESTED_COLLECTIONS, GRADEBOOKS]);
    const listed = await instRef.listCollections();
    extraNames = listed.map((c) => c.id).filter((id) => !known.has(id));
  } catch (err) {
    problems.push(`listCollections: ${err && err.code ? err.code : 'error'}`);
  }
  for (const name of extraNames) {
    const count = await countQuery(instRef.collection(name), name, problems);
    rows.push({ name, count, drained: false });
  }
  return rows;
}

async function countRosterDocs(db, institutionId, problems) {
  const users = await countQuery(db.collection('users').where('institutionId', '==', institutionId), 'users', problems);
  const links = await countQuery(
    db.collection('student_parents').where('institutionId', '==', institutionId),
    'student_parents',
    problems,
  );
  return { users, links };
}

// Pages through Auth with listUsers (no Firestore reads) and counts accounts
// on the seed domain. Never prints an email.
async function countAuthSeedAccounts(auth, emailDomain) {
  const suffix = `@${emailDomain.toLowerCase()}`;
  let seed = 0;
  let total = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      total++;
      if ((user.email ?? '').toLowerCase().endsWith(suffix)) seed++;
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return { seed, total };
}

function fmt(n) {
  return n === null ? 'n/a' : n.toLocaleString('en-US');
}

function writeLog(kind, payload) {
  mkdirSync(LOGS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(LOGS_DIR, `count-seed-institution-${kind}-${stamp}.json`);
  writeFileSync(logPath, JSON.stringify(payload, null, 2));
  console.log(`Counts log written to ${path.relative(process.cwd(), logPath)} (counts only).`);
}

async function runCounts({ db, projectId, institutionId, institutionExists }) {
  const problems = [];
  console.log('Counting (read-only aggregations)...');
  const tree = institutionExists ? await countInstitutionTree(db, institutionId, problems) : [];
  const roster = await countRosterDocs(db, institutionId, problems);

  console.log('');
  console.log('Documents under institutions/{seed id}:');
  for (const row of tree) {
    console.log(`  ${row.name.padEnd(28)} ${fmt(row.count).padStart(9)}${row.drained ? '' : '   <- NOT drained by teardown'}`);
  }
  console.log('');
  console.log(`  users (roster documents)     ${fmt(roster.users).padStart(9)}`);
  console.log(`  student_parents (links)      ${fmt(roster.links).padStart(9)}`);

  const treeTotal = tree.reduce((sum, r) => sum + (r.drained ? r.count ?? 0 : 0), 0);
  const total = treeTotal + (roster.users ?? 0) + (roster.links ?? 0);
  const notDrained = tree.filter((r) => !r.drained).reduce((sum, r) => sum + (r.count ?? 0), 0);
  const incomplete = problems.length > 0 || tree.some((r) => r.count === null) || roster.users === null || roster.links === null;
  console.log('');
  console.log(`Documents teardown will delete (counted): ${fmt(total)}${incomplete ? '  (INCOMPLETE: see problems below)' : ''}`);
  console.log(`Documents left that teardown does NOT drain: ${fmt(notDrained)}`);
  const runs = Math.max(1, Math.ceil(total / DEFAULT_DELETE_BUDGET));
  console.log(`Estimated daily runs at a ${fmt(DEFAULT_DELETE_BUDGET)} delete budget: about ${runs}` +
    ' (the Auth deletions and the final institution document are extra and use other quotas).');
  if (problems.length > 0) {
    console.log('');
    console.log('Problems (counts that could not be read):');
    for (const p of problems) console.log(`  - ${p}`);
  }

  writeLog('counts', {
    projectId,
    institutionId,
    at: new Date().toISOString(),
    tree: tree.map((r) => ({ name: r.name, count: r.count, drained: r.drained })),
    users: roster.users,
    studentParents: roster.links,
    totalToDelete: total,
    notDrained,
    estimatedRuns: runs,
    problems,
  });
  return 0;
}

async function runVerify({ db, auth, projectId, institutionId, emailDomain, directory, institutionExists }) {
  const problems = [];
  const results = [];
  const check = (label, pass, detail) => {
    results.push({ label, pass });
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  };

  console.log('Verifying (read-only)...');
  const authCounts = await countAuthSeedAccounts(auth, emailDomain);
  check(`Auth accounts on ${emailDomain} are gone`, authCounts.seed === 0, `${authCounts.seed} left`);
  check('institutions/{seed id} is gone', !institutionExists);
  check('registration_directory/{seed id} is gone', !directory.exists);

  const roster = await countRosterDocs(db, institutionId, problems);
  check('roster users documents are gone', roster.users === 0, `${fmt(roster.users)} left`);
  check('student_parents links are gone', roster.links === 0, `${fmt(roster.links)} left`);

  // Subcollections outlive a deleted parent document, so count them either way.
  const tree = await countInstitutionTree(db, institutionId, problems);
  const remaining = tree.reduce((sum, r) => sum + (r.count ?? 0), 0);
  check('every subcollection under the seed institution is empty', remaining === 0 && !tree.some((r) => r.count === null), `${fmt(remaining)} left`);
  for (const row of tree.filter((r) => (r.count ?? 0) > 0)) {
    console.log(`        left in ${row.name}: ${fmt(row.count)}${row.drained ? '' : '  (not drained by teardown; needs the orphan sweep)'}`);
  }
  if (problems.length > 0) {
    console.log('');
    console.log('Problems (counts that could not be read):');
    for (const p of problems) console.log(`  - ${p}`);
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log('');
  console.log(failed === 0 && problems.length === 0 ? 'ALL CHECKS PASSED.' : `${failed} check(s) FAILED${problems.length ? `, ${problems.length} problem(s)` : ''}.`);
  console.log('(Orphans under users/{uid}/activity_log and photo are not checked here; see the plan section A.7.)');

  writeLog('verify', {
    projectId,
    institutionId,
    at: new Date().toISOString(),
    authSeedAccountsLeft: authCounts.seed,
    results,
    remainingUnderInstitution: remaining,
    problems,
  });
  return failed === 0 && problems.length === 0 ? 0 : 1;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const key = readKey(opts.keyPath);
  const projectId = key.project_id;

  console.log(`Mode: ${opts.verify ? 'verify' : 'counts'} (read-only)`);
  console.log(`Project id in the key file: ${projectId}`);
  const rcDefault = readFirebasercDefault();
  if (rcDefault) console.log(`.firebaserc default project: ${rcDefault}`);
  if (opts.project !== projectId) {
    fail(`--project=${opts.project} does not match the key file's project_id (${projectId}). Nothing was read.`);
  }

  const cp = loadSeedCheckpoint();
  const institutionId = cp.institutionId;
  console.log(`Seed institution id: ${institutionId}`);

  const app = initializeApp({ credential: cert(key), projectId });
  const db = getFirestore(app);
  const auth = getAuth(app);

  const institution = await verifySeedName(db, 'institutions', institutionId);
  console.log(
    institution.exists
      ? 'Institution document: present, name ends with the seed suffix (ok).'
      : 'Institution document: absent.',
  );
  const directory = await verifySeedName(db, 'registration_directory', institutionId);
  console.log(directory.exists ? 'Public directory entry: present (ok).' : 'Public directory entry: absent.');
  console.log('');

  const ctx = { db, auth, projectId, institutionId, emailDomain: cp.emailDomain, directory, institutionExists: institution.exists };
  return opts.verify ? runVerify(ctx) : runCounts(ctx);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err && err.code ? `Error: ${err.code}` : err);
    process.exit(1);
  });
