#!/usr/bin/env node
/**
 * Freezes the bulk-seed institution's accounts (Day-0 item 3, §A.3 of
 * internal/retcon/CLIENT_SIDE_SECURITY_TIGHTENING_PLAN.md).
 *
 * Why: the seed institution's ~2,500 accounts (2,492 of them on the public
 * role-default passwords) stay usable, and the institution stays in the public
 * login dropdown, until scripts/teardown-bulk-institution.mjs reaches its Auth
 * phase days from now. This script removes that exposure immediately:
 *
 *   1. deletes the institution's public registration_directory entry, so it
 *      leaves the login dropdown (done first, so an interrupted run still
 *      removes the entry);
 *   2. disables every roster account in Firebase Auth and revokes its refresh
 *      tokens.
 *
 * It touches ONLY the uids in the seed script's own checkpoint
 * (scripts/.seed-checkpoint.json), never a broad query, and refuses to run
 * unless every guard below passes:
 *   - --project must equal the project_id inside the --key file (printed);
 *   - the seed institution's name must end with "(Seed Test Institution)";
 *   - every roster account found in Auth must have an email on the
 *     checkpoint's emailDomain (one mismatch aborts the whole run).
 *
 * Dry run is the default (reads only). --live writes, and only after you type
 * the exact confirmation phrase. No emails or passwords are ever printed or
 * logged; the result log holds counts and failed uids only.
 *
 * Costs: two Firestore reads (institution + directory entry), one write (the
 * directory delete); no per-user Firestore reads. Auth: about two account
 * updates per account, paced like scripts/reset-role-default-passwords.mjs
 * (concurrency 10, 5 s between chunks), so roughly 20-25 minutes for 2,500.
 *
 * Limits: an ID token already issued can still pass Firestore rules for up to
 * about an hour. Disabled users are handled normally by the teardown's later
 * deleteUsers() phase. Idempotent: a re-run skips accounts already disabled.
 * There is deliberately no flag to undo it; re-enabling is a manual
 * auth.updateUser(uid, { disabled: false }) if ever needed.
 *
 * Usage:
 *   node scripts/disable-seed-accounts.mjs --key=<path> --project=<id> [--live]
 *
 * Never commit the key or the checkpoint (see .gitignore).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_CHECKPOINT_PATH = path.join(__dirname, '.seed-checkpoint.json');
const FIREBASERC_PATH = path.join(__dirname, '..', '.firebaserc');
const LOGS_DIR = path.join(__dirname, 'logs');

// Must match seed-bulk-institution.mjs / teardown-bulk-institution.mjs.
const SEED_INSTITUTION_SUFFIX = '(Seed Test Institution)';
// Hard-coded sanity check on the checkpoint's own emailDomain, so a
// replaced or edited checkpoint cannot point this script at real accounts.
const EXPECTED_EMAIL_DOMAIN = 'jones-and-sons.seed.test';

// Same pacing as scripts/reset-role-default-passwords.mjs: Identity Toolkit
// account updates are limited to roughly 300 per minute per project, and this
// script makes two such calls per account.
const AUTH_CONCURRENCY = 10;
const CHUNK_PACING_MS = 5000;
const GET_USERS_BATCH = 100; // firebase-admin getUsers() maximum

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retries only on auth/quota-exceeded; any other error is rethrown at once.
async function withQuotaRetry(fn, { retries = 5, baseDelayMs = 3000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err && err.code === 'auth/quota-exceeded' && attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt;
        console.log(`    quota exceeded, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

function printUsageAndExit(code) {
  console.log(`
Usage: node scripts/disable-seed-accounts.mjs --key=<path> --project=<id> [--live]

  --key=<path>     Service-account JSON key for the project that holds the seed
                   institution. Required (no Application Default Credentials
                   fallback).
  --project=<id>   The Firebase project id you expect to touch. Must equal the
                   project_id inside the key file, or the script refuses.
  --live           Actually disable accounts and delete the directory entry,
                   after you type the confirmation phrase. Omit for a dry run
                   (reads only; this is the default).
  --help           Show this text.
`);
  process.exit(code);
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
  if (!opts.keyPath) {
    console.error('--key=<path> is required (there is no Application Default Credentials fallback).');
    printUsageAndExit(1);
  }
  if (!opts.project) {
    console.error('--project=<id> is required, so the script can prove it targets the project you meant.');
    printUsageAndExit(1);
  }
  return opts;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readKeyProjectId(keyPath) {
  if (!existsSync(keyPath)) fail(`Key file not found: ${keyPath}`);
  let key;
  try {
    key = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch {
    fail(`Key file is not valid JSON: ${keyPath}`);
  }
  if (!key || typeof key.project_id !== 'string') fail('Key file has no project_id.');
  return { key, projectId: key.project_id };
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
      `No seed checkpoint found at ${SEED_CHECKPOINT_PATH}. This script takes the institution id and the roster ` +
        'from it (never from a broad query), so there is nothing it can safely do without it.',
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
    fail(
      `The seed checkpoint's emailDomain is not "${EXPECTED_EMAIL_DOMAIN}". Refusing to continue: ` +
        'this script only ever touches that domain.',
    );
  }
  if (!Array.isArray(cp.roster) || cp.roster.length === 0) {
    fail('The seed checkpoint has an empty or missing roster.');
  }
  return cp;
}

function rosterUids(cp) {
  const seen = new Set();
  const byRole = {};
  for (const entry of cp.roster) {
    if (!entry || typeof entry.uid !== 'string' || !entry.uid) continue;
    if (entry.authCreated === false) continue; // never created in Auth
    if (seen.has(entry.uid)) continue;
    seen.add(entry.uid);
    const role = typeof entry.role === 'string' ? entry.role : 'unknown';
    byRole[role] = (byRole[role] ?? 0) + 1;
  }
  return { uids: [...seen], byRole };
}

async function verifySeedName(db, collectionName, institutionId) {
  const snap = await db.collection(collectionName).doc(institutionId).get();
  if (!snap.exists) return { exists: false };
  const name = snap.data()?.name ?? '';
  if (typeof name !== 'string' || !name.endsWith(SEED_INSTITUTION_SUFFIX)) {
    fail(
      `Safety check failed: ${collectionName}/${institutionId} has a name that does not end with ` +
        `"${SEED_INSTITUTION_SUFFIX}". Refusing to touch anything. If this really is the seed institution, ` +
        'find out why its name changed before proceeding.',
    );
  }
  return { exists: true };
}

// Read-only: classifies every roster uid. Aborts the whole run on any email
// that is not on the seed domain (nothing has been changed at that point).
async function classifyAccounts(auth, uids, emailDomain) {
  const suffix = `@${emailDomain.toLowerCase()}`;
  const counts = { found: 0, notFound: 0, alreadyDisabled: 0 };
  const toDisable = [];
  for (let i = 0; i < uids.length; i += GET_USERS_BATCH) {
    const batch = uids.slice(i, i + GET_USERS_BATCH);
    const result = await auth.getUsers(batch.map((uid) => ({ uid })));
    counts.notFound += result.notFound.length;
    for (const user of result.users) {
      counts.found++;
      const email = (user.email ?? '').toLowerCase();
      if (!email.endsWith(suffix)) {
        fail(
          `Safety check failed: Auth account ${user.uid} does not have an email on "${emailDomain}". ` +
            'The checkpoint and Auth disagree; nothing was changed. Refusing to continue.',
        );
      }
      if (user.disabled) counts.alreadyDisabled++;
      else toDisable.push(user.uid);
    }
  }
  return { counts, toDisable };
}

function askConfirmation(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function disableOne(auth, uid) {
  try {
    await withQuotaRetry(() => auth.updateUser(uid, { disabled: true }));
    await withQuotaRetry(() => auth.revokeRefreshTokens(uid));
    return 'disabled';
  } catch (err) {
    if (err && err.code === 'auth/user-not-found') return 'notFound';
    console.error(`    failed for uid ${uid}: ${err && err.code ? err.code : 'error'}`);
    return 'failed';
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { key, projectId } = readKeyProjectId(opts.keyPath);

  console.log(`Mode: ${opts.live ? 'LIVE' : 'dry run (reads only)'}`);
  console.log(`Project id in the key file: ${projectId}`);
  const rcDefault = readFirebasercDefault();
  if (rcDefault) console.log(`.firebaserc default project: ${rcDefault}`);
  if (opts.project !== projectId) {
    fail(`--project=${opts.project} does not match the key file's project_id (${projectId}). Nothing was touched.`);
  }

  const cp = loadSeedCheckpoint();
  const institutionId = cp.institutionId;
  const { uids, byRole } = rosterUids(cp);
  console.log(`Seed institution id: ${institutionId}`);
  console.log(`Roster accounts in the checkpoint: ${uids.length}`);
  console.log(`  by role: ${Object.entries(byRole).map(([r, n]) => `${r}=${n}`).join(', ')}`);

  const app = initializeApp({ credential: cert(key), projectId });
  const db = getFirestore(app);
  const auth = getAuth(app);

  const institution = await verifySeedName(db, 'institutions', institutionId);
  console.log(
    institution.exists
      ? 'Institution document: present, name ends with the seed suffix (ok).'
      : 'Institution document: already gone (an earlier teardown finished that phase); continuing with Auth only.',
  );
  const directory = await verifySeedName(db, 'registration_directory', institutionId);
  console.log(
    directory.exists
      ? 'Public directory entry: present, name ends with the seed suffix (ok).'
      : 'Public directory entry: absent.',
  );

  console.log('Checking the roster in Auth (read-only)...');
  const { counts, toDisable } = await classifyAccounts(auth, uids, cp.emailDomain);
  console.log(`  found in Auth: ${counts.found}`);
  console.log(`  not found in Auth: ${counts.notFound}`);
  console.log(`  already disabled: ${counts.alreadyDisabled}`);
  console.log(`  to disable now: ${toDisable.length}`);
  console.log('  (every found account has an email on the seed domain)');

  if (!opts.live) {
    console.log('');
    console.log('Dry run complete; nothing was changed.');
    console.log('To apply, run the same command with --live and type the confirmation phrase when asked:');
    console.log(`  node scripts/disable-seed-accounts.mjs --key=${opts.keyPath} --project=${projectId} --live`);
    console.log(`  phrase: DISABLE ${toDisable.length} ${institutionId}`);
    return 0;
  }

  if (toDisable.length === 0 && !directory.exists) {
    console.log('');
    console.log('Nothing to do: no accounts to disable and no directory entry.');
    return 0;
  }

  console.log('');
  const phrase = `DISABLE ${toDisable.length} ${institutionId}`;
  const answer = await askConfirmation(`Type ${phrase} to continue: `);
  if (answer !== phrase) {
    console.error('Confirmation did not match. Nothing was changed.');
    return 1;
  }

  const result = { disabled: 0, notFound: 0, failed: 0, directoryDeleted: false };
  const failedUids = [];

  if (directory.exists) {
    await db.collection('registration_directory').doc(institutionId).delete();
    result.directoryDeleted = true;
    console.log('Deleted the public directory entry.');
  }

  for (let i = 0; i < toDisable.length; i += AUTH_CONCURRENCY) {
    const chunk = toDisable.slice(i, i + AUTH_CONCURRENCY);
    const outcomes = await Promise.all(chunk.map((uid) => disableOne(auth, uid)));
    outcomes.forEach((outcome, idx) => {
      result[outcome]++;
      if (outcome === 'failed') failedUids.push(chunk[idx]);
    });
    console.log(`  ...${Math.min(i + AUTH_CONCURRENCY, toDisable.length)}/${toDisable.length} processed`);
    if (i + AUTH_CONCURRENCY < toDisable.length) await sleep(CHUNK_PACING_MS);
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Disabled: ${result.disabled}`);
  console.log(`  Already disabled (skipped): ${counts.alreadyDisabled}`);
  console.log(`  Not found in Auth: ${counts.notFound + result.notFound}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  Directory entry deleted: ${result.directoryDeleted ? 'yes' : 'no'}`);

  mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = path.join(LOGS_DIR, `disable-seed-accounts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        projectId,
        institutionId,
        at: new Date().toISOString(),
        roster: uids.length,
        disabled: result.disabled,
        alreadyDisabled: counts.alreadyDisabled,
        notFound: counts.notFound + result.notFound,
        failed: result.failed,
        failedUids,
        directoryDeleted: result.directoryDeleted,
      },
      null,
      2,
    ),
  );
  console.log(`Result log written to ${path.relative(process.cwd(), logPath)} (counts and failed uids only).`);

  return result.failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err && err.code ? `Error: ${err.code}` : err);
    process.exit(1);
  });
