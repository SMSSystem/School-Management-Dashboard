#!/usr/bin/env node
/**
 * Removes the Firebase Authentication accounts left behind by the app's "Delete user"
 * button. The button deletes a student's or teacher's users/{uid} document and records,
 * but a browser cannot delete another person's sign-in, so the Auth account stays until
 * this runs.
 *
 * An "orphan" is an Auth account with NO users/{uid} document, at least 24 hours old
 * (a newer one may still be mid-creation: the create form makes the Auth account, then
 * its profile). Nothing else is touched.
 *
 * DRY RUN BY DEFAULT: nothing is deleted unless you pass --live. Addresses are only
 * printed masked (first character and domain). Every run writes a local log to
 * scripts/logs/ (gitignored; it holds uids and masked addresses).
 *
 * Usage:
 *   node scripts/remove-orphan-auth-accounts.mjs --key=<path> [--uid=<uid>] [--live]
 *
 *   --uid=<uid>   Consider only this one account (still refused if it has a document).
 *   --live        Actually delete. Omit for a dry run (the default).
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { maskEmail, pickOrphans } from './removeOrphanAuthLogic.mjs';

function printUsageAndExit(code) {
  console.log(`
Usage:
  node scripts/remove-orphan-auth-accounts.mjs --key=<path> [--uid=<uid>] [--live]

  --key=<path>   Service-account JSON key (or set GOOGLE_APPLICATION_CREDENTIALS).
  --uid=<uid>    Consider only this one account.
  --live         Actually delete. Omit for a dry run (the default).
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { keyPath: null, uid: null, live: false };
  for (const arg of argv) {
    if (arg === '--live') opts.live = true;
    else if (arg.startsWith('--key=')) opts.keyPath = arg.slice('--key='.length);
    else if (arg.startsWith('--uid=')) opts.uid = arg.slice('--uid='.length);
    else if (arg === '--help' || arg === '-h') printUsageAndExit(0);
    else {
      console.error(`Unrecognized argument: ${arg}`);
      printUsageAndExit(1);
    }
  }
  if (opts.uid && !/^[A-Za-z0-9]{10,64}$/.test(opts.uid)) {
    console.error('--uid must be a single Firebase uid (letters and digits only).');
    process.exit(1);
  }
  return opts;
}

async function listAllAuthUsers(auth) {
  const out = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) out.push({ uid: u.uid, email: u.email, creationTime: u.metadata.creationTime });
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyPath = opts.keyPath ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !existsSync(keyPath)) {
    console.error('A service-account key is required: pass --key=<path> or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  const app = initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
  const db = getFirestore(app);
  const auth = getAuth(app);

  console.log(`Mode: ${opts.live ? 'LIVE (will delete)' : 'dry run (nothing will be deleted)'}`);
  console.log('');

  const authUsers = await listAllAuthUsers(auth);
  // Only the document ids are needed: select() with no fields reads no field data.
  const userDocs = await db.collection('users').select().get();
  const existingUids = new Set(userDocs.docs.map((d) => d.id));
  console.log(`Auth accounts: ${authUsers.length}; users documents: ${existingUids.size}`);

  const { picked, skipped } = pickOrphans({ authUsers, existingUids, nowMs: Date.now(), onlyUid: opts.uid });
  for (const s of skipped) console.log(`  Skipped ${s.uid}: ${s.reason}`);
  if (picked.length === 0) {
    console.log('No orphan Auth accounts to remove.');
    return;
  }
  console.log(`${opts.live ? 'Removing' : 'Would remove'} ${picked.length} Auth account(s):`);
  for (const u of picked) console.log(`  ${u.uid}  ${maskEmail(u.email)}`);

  const entry = { live: opts.live, accounts: picked.map((u) => ({ uid: u.uid, email: maskEmail(u.email) })), deleted: 0, failed: [] };
  if (opts.live) {
    for (let i = 0; i < picked.length; i += 1000) {
      const chunk = picked.slice(i, i + 1000).map((u) => u.uid);
      const result = await auth.deleteUsers(chunk);
      entry.deleted += result.successCount;
      for (const e of result.errors) entry.failed.push({ uid: chunk[e.index], error: e.error.message });
    }
    console.log(`Deleted ${entry.deleted}; failed ${entry.failed.length}.`);
  } else {
    console.log('Dry run only. Run again with --live to delete these.');
  }

  mkdirSync('scripts/logs', { recursive: true });
  const logPath = `scripts/logs/remove-orphan-auth-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(logPath, JSON.stringify(entry, null, 2));
  console.log(`Log: ${logPath}`);
  if (entry.failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
