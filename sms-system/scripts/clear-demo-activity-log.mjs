#!/usr/bin/env node
/**
 * Clears the "Activity" list (users/{uid}/activity_log: the sign-in / sign-out entries on the
 * User Profile page) of one Blue Mountain demo account, by default the spectator's, so the
 * real person it is handed to sees a fresh list. Run it LAST, after your own test sign-ins:
 * every sign-in (yours too) adds an entry. The prospect's first sign-in will add one.
 *
 * Only the six demo accounts (bmps* ids) can be targeted, and only if the user document
 * belongs to the checkpointed demo institution. Nothing else is touched: not the audit log,
 * not the profile.
 *
 * DRY RUN BY DEFAULT: nothing is deleted unless you pass --live. It prints the number of
 * entries and their date range only, never their contents.
 *
 * Usage:
 *   node scripts/clear-demo-activity-log.mjs --key=<path> [--uid=bmpsspe001] [--live]
 *
 * Never commit the key (see .gitignore).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isDemoLoginUid } from './seedDemoPrimaryLogic.mjs';
import { usageExit } from './adminCli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_PATH = path.join(__dirname, '.demo-primary-checkpoint.json');
const DEFAULT_UID = 'bmpsspe001';

const printUsageAndExit = usageExit(`
Usage:
  node scripts/clear-demo-activity-log.mjs --key=<path> [--uid=${DEFAULT_UID}] [--live]

  --key=<path>   Service-account JSON key (or GOOGLE_APPLICATION_CREDENTIALS).
  --uid=<uid>    One of the six demo accounts (default: the spectator, ${DEFAULT_UID}).
  --live         Actually delete. Omit for a dry run (the default).
`);

function parseArgs(argv) {
  const opts = { keyPath: null, uid: DEFAULT_UID, live: false };
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
  if (!isDemoLoginUid(opts.uid)) {
    console.error('--uid must be one of the six Blue Mountain demo accounts.');
    process.exit(1);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(CHECKPOINT_PATH)) {
    console.error('No demo checkpoint found (scripts/.demo-primary-checkpoint.json); run this on the machine that seeded the demo.');
    process.exit(1);
  }
  const institutionId = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8')).institutionId;
  if (opts.keyPath && !existsSync(opts.keyPath)) {
    console.error(`Key file not found: ${opts.keyPath}`);
    process.exit(1);
  }
  const credential = opts.keyPath ? cert(JSON.parse(readFileSync(opts.keyPath, 'utf8'))) : applicationDefault();
  const db = getFirestore(initializeApp({ credential }));

  const userSnap = await db.doc(`users/${opts.uid}`).get();
  if (!userSnap.exists || userSnap.data().institutionId !== institutionId) {
    console.error(`users/${opts.uid} is missing or does not belong to the demo institution. Refusing.`);
    process.exit(1);
  }

  const entries = await db.collection(`users/${opts.uid}/activity_log`).select('timestamp').get();
  console.log(`Mode: ${opts.live ? 'LIVE (will delete)' : 'dry run (nothing will be deleted)'}`);
  console.log(`Account ${opts.uid} (${userSnap.data().role}): ${entries.size} Activity entries.`);
  if (entries.size > 0) {
    const times = entries.docs.map((d) => d.data().timestamp).filter((t) => typeof t === 'string').sort();
    if (times.length > 0) console.log(`  from ${times[0]} to ${times[times.length - 1]}`);
  }
  if (entries.size === 0) {
    console.log('Nothing to clear.');
    return;
  }
  if (!opts.live) {
    console.log('Dry run only. Add --live to delete them.');
    return;
  }
  const writer = db.bulkWriter();
  for (const d of entries.docs) writer.delete(d.ref);
  await writer.close();
  console.log(`Deleted ${entries.size} entries. The next sign-in will add a new one.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
